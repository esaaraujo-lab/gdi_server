// ═══════════════════════════════════════════════════════════════
// gdi-study.js — Área do Aluno + Estudo Ativo + Visual
//
// Módulos:
//   • M22: Área do Aluno (painel full-screen com abas:
//     Início, Questões, Simulado, Provas, Redação, Cronograma,
//     Estatísticas, Mapa de Fracos, Conquistas, Adicionar matéria, Resumos)
//   • M23: Estudo Ativo (banco de questões, simulado, cronograma SRS)
//   • M24: Provas anteriores, Redação, Radar de Fracos
//   • BlackTie: tema visual (fontes, cores, override de estilos)
//   • M-PLAYER-GUARD: watchdog contra vídeos travados
//
// Depende de: gdi-core.js, gdi-meggy.js (para extractPdfText)
// ═══════════════════════════════════════════════════════════════

// M23: ESTUDO ATIVO — questões, simulados, cronograma, revisões
// Fornece renderQuestoes/renderSimulado/renderCronograma/renderRevisoes
// consumidos pelo M22 (Área do Aluno). Dados em localStorage.
// Integra com: GDIUser (SRS), /api/ai (ISA gera questões), playlist.
// ═══════════════════════════════════════════════════════════════
(function(){
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
  let _qFilterSubject=null; // null = todas
  let _qShown=0;            // quantas questões já estão renderizadas
  const QPAGE=20;
  window.renderQuestoes=function(box){
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
  };

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
        box.querySelector('#gdi-q-back').onclick=()=>window.renderQuestoes(box);
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
  window.renderSimulado=function(box){
    const qs=questions();
    const sims=simus().slice().reverse();
    // lista cursos do aluno para filtrar questões por curso
    // ★ Task 26: usa window.__gdiCollectCourses (collectCourses está em IIFE diferente)
    const courses=(window.__gdiCollectCourses||function(){return []})();
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
  };

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
        try{localStorage.setItem('gdi-simulados-count',String((window.gdiAchievements?window.gdiAchievements:undefined)||(lsGet('gdi-simulados-v1',[]).length)));}catch(_){}
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
      box.querySelector('#sim-back').onclick=()=>window.renderSimulado(box);
    }
    draw();
    const timer=setInterval(()=>{if(Date.now()>=deadline){clearInterval(timer);finish();}},1000);
    // armazena timer p/ limpeza se trocar de aba
    box.__simTimer=timer;
  }

  // ── Render: Cronograma (C.4 — paginação nos itens futuros) ──
  window.renderCronograma=function(box){
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
        window.renderCronograma(box);
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
    box.querySelector('#cr-reset').onclick=()=>{lsSet(LS_CRON,null);box.__cronPage=0;window.renderCronograma(box);};
  };

  // ── Render: Revisões (calendário) ──
  // ★ Tab REMOVIDA do sidebar (user request), mas função MANTIDA para API pública.
  window.renderRevisoes=function(box){
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
  };

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

  console.log('[GDI Extras] M23 Estudo Ativo (questões/simulado/cronograma/revisões) ativo');
})();


// ═══ M22 v2: ÁREA DO ALUNO — painel + botão FORA do body ═══
(function(){
  const LS_CARDS='gdi-cards-v1',LS_GOAL='gdi-goal-min',LS_WATCH='gdi-watch-v1',LS_MAR='gdi-marathon',LS_MARINTRO='gdi-marathon-intro',LS_HIDDEN='gdi-hidden-courses-v1';
  const log=(...a)=>{try{console.log('[GDI M22]',...a)}catch(_){}};
  const dec=s=>{try{return decodeURIComponent(String(s||''))}catch(_){return String(s||'')}};
  const norm=p=>dec(String(p||'').split('?')[0].replace(/\/+$/,''));
  const low=p=>norm(p).toLowerCase();
  const stripExt=s=>String(s||'').replace(/\.[a-z0-9]{1,5}$/i,'').trim();
  const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  // ★ FIX: esc local para o M22 (Área do Aluno) — usa escHtml global do app.min.js quando disponível
  const esc=s=>{try{return window.escHtml?window.escHtml(s):String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');}catch(_){return String(s||'');}};
  const fmtMin=m=>{m=Math.round(m);return m>=60?Math.floor(m/60)+'h'+String(m%60).padStart(2,'0'):m+'min'};
  const dayKey=t=>{const d=new Date(t||Date.now());return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const dateBr=t=>new Date(t).toLocaleDateString('pt-BR');

  // ═══ HANDLER GLOBAL DE ADICIONAR CURSO (definido no carregamento do módulo) ═══
  // Sempre disponível — não depende de showAddCourseModal ter rodado.
  // Self-contained: usa DOM queries para achar overlay e box, sem closures.
  // Inline onclick chama window.gdiAddCourseFromButton(this).
  // PATCH G: captura via overlay quando modal abre (em showAddCourseModal),
  // removendo o document-level capture listener global.
  window.gdiAddCourseFromButton=async function(btn){
    if(!btn){
      console.error('[AddCourse] botão null');
      return;
    }
    const p=btn.dataset.path||'';
    const n=btn.dataset.name||'Pasta';
    const pdfs=parseInt(btn.dataset.pdfs||'0',10);
    if(!p){
      console.error('[AddCourse] data-path vazio — abortando');
      if(window.showToast)showToast('Erro: pasta não selecionada');
      return;
    }
    // ★ 1) feedback visual imediato
    const originalText=btn.textContent;
    btn.disabled=true;
    btn.style.opacity='0.6';
    btn.style.pointerEvents='none';
    btn.innerHTML='<i class="bi bi-hourglass-split"></i> Adicionando...';
    try{
      // ★ 2) chamar persistência — função global self-contained
      await window.gdiAddCourseFromDrive(p, n, pdfs);
    }catch(err){
      console.error('[AddCourse] ERRO:',err);
      if(window.showToast)showToast('Erro: '+err.message);
      // restaura botão em caso de erro
      btn.disabled=false;
      btn.style.opacity='1';
      btn.style.pointerEvents='auto';
      btn.textContent=originalText;
    }
  };

  // ★ Função global self-contained: adiciona curso do Drive
  window.gdiAddCourseFromDrive=async function(coursePath, courseName, pdfCount){
    // ★ FIX 1 (Task 23): decode URL-encoded courseName defensively.
    // The Add Course modal decodes the folder name before passing it here,
    // BUT legacy localStorage entries (saved before Task 22) may have %20 in
    // the name field. Also, if the modal is bypassed (e.g. by an external
    // caller passing a raw path), courseName may still be URL-encoded.
    // Decoding here is idempotent (decodeURIComponent of an already-decoded
    // string with no %XX sequences is a no-op).
    try{if(courseName&&String(courseName).indexOf('%')>=0)courseName=decodeURIComponent(courseName);}catch(_){}
    const overlay=document.querySelector('.gdi-modal-overlay');
    const box=document.getElementById('gdi-central-body');
    const LS_MANUAL='gdi-manual-courses-v1';
    const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
    const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};

    try{
      const manual=lsGet(LS_MANUAL,[]);
      const alreadyExists=manual.some(c=>c.path===coursePath);

      if(!alreadyExists){
        // ★ 1) SALVA no localStorage — aparece imediatamente na lista do aluno
        // ★ FIX 4 (Task 14): agora também persiste pdfCount, para que colectCourses()
        //    possa exibir totalLessons real (não mais c.lessons.size = paths visitados).
        const courseId='mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
        manual.push({
          id:courseId,name:courseName,icon:'📁',color:'#5ddeda',
          goal:60,notes:'',createdAt:Date.now(),
          manual:true,path:coursePath,courseKey:coursePath,
          pdfCount:pdfCount||0  // ★ FIX 4: total real de aulas (Drive scan)
        });
        lsSet(LS_MANUAL,manual);
      }

      // ★ 2) POST /api/courses/add — salva em general_courses.json no Drive (compartilhado)
      // Não-bloqueante: se falhar, mostra warning mas continua o fluxo
      // ★ FIX 4 (Task 14): usa window.GDIStorage.saveCourse() para também invalidar
      //    cache de courses (cross-device). Mantém POST direto como fallback.
      try{
        if(window.GDIStorage && typeof window.GDIStorage.saveCourse==='function'){
          // caminho preferido — invalida cache + POST
          window.GDIStorage.saveCourse(coursePath,courseName,pdfCount||0).catch(e=>{
            console.warn('[AddCourse] GDIStorage.saveCourse falhou, tentando POST direto:',e.message);
            // fallback direto
            fetch('/api/courses/add',{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({coursePath,courseName,pdfCount:pdfCount||0,addedAt:Date.now()})
            }).catch(()=>{});
          });
        }else{
          // storage.js indisponível — POST direto
          const r=await fetch('/api/courses/add',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              coursePath,courseName,
              pdfCount:pdfCount||0,
              addedAt:Date.now()
            })
          });
          if(r.ok){
            await r.json().catch(()=>({}));
          }else{
            console.warn('[AddCourse] /api/courses/add HTTP',r.status,'— continuando mesmo assim');
          }
        }
      }catch(e){
        console.warn('[AddCourse] falha ao salvar no Drive (continuando):',e.message);
      }

      // ★ 3) feedback visual: toast
      if(window.showToast)showToast(alreadyExists
        ? 'Curso já estava adicionado — Meggy continua trabalhando em background 🐩'
        : 'Curso "'+courseName+'" adicionado! 🐩 Batalhão de IA iniciando em background...');

      // ★ 4) re-renderiza lista de cursos ANTES de fechar modal
      if(box){
        try{
          if(typeof window.gdiRefreshCentralPanel==='function'){
            window.gdiRefreshCentralPanel();
          }else if(typeof window.renderCursos==='function'){
            window.renderCursos(box);
          }
        }catch(e){console.warn('[AddCourse] erro ao re-renderizar:',e.message);}
      }

      // ★ 5) fecha modal — agora que tudo está salvo
      if(overlay&&overlay.parentNode){
        overlay.remove();
      }

      // ★ 6) dispara batalhão em background (não-bloqueante)
      try{
        if(window.gdiIsaPdf && window.gdiIsaPdf.startBattalion){
          window.gdiIsaPdf.startBattalion(coursePath, coursePath, courseName, []).catch(e=>{
            console.warn('[Batalhão] falha assíncrona (não bloqueante):',e.message);
          });
        }else{
          console.warn('[AddCourse] gdiIsaPdf.startBattalion indisponível — batalhão não disparado');
        }
      }catch(e){console.warn('[Batalhão] falha:',e.message);}

      // ★ 7) Task 15: dispara scanner LEVE em background — conta aulas reais do curso.
      //    Não-bloqueante (usa worker bridge + 500ms pause entre pastas).
      //    Atualiza a barra de progresso no tile da home, se visível.
      //    Salva estrutura em localStorage (cache) e Drive (.meggy.ai/courses/<key>/lessons.json).
      try{
        if(window.gdiCourseScanner && typeof window.gdiCourseScanner.startScan === 'function'){
          window.gdiCourseScanner.startScan(coursePath, function(state, lessonsData){
            // Atualiza tile da home, se visível
            try{
              const tiles = document.querySelectorAll('[data-course-key]');
              let tile = null;
              for(let i=0; i<tiles.length; i++){
                if(tiles[i].dataset.courseKey === coursePath){ tile = tiles[i]; break; }
              }
              if(tile){
                const bar = tile.querySelector('.gdi-scan-progress');
                if(bar){
                  const pct = (state.totalFolders > 0)
                    ? Math.round((state.scannedFolders||0)/state.totalFolders*100)
                    : 0;
                  bar.style.width = pct + '%';
                  if(bar.parentElement){
                    bar.parentElement.title = 'Escaneando: '+(state.scannedFolders||0)+'/'+(state.totalFolders||0)+
                      ' pastas, '+((lessonsData && lessonsData.lessons && lessonsData.lessons.length)||0)+' aulas encontradas';
                  }
                }
                // Atualiza contagem de aulas no tile em tempo real
                const totalEl = tile.querySelector('[data-stat="total"]');
                if(totalEl && lessonsData && lessonsData.lessons){
                  totalEl.textContent = lessonsData.lessons.length;
                }
                // Atualiza texto de status
                const statusEl = tile.querySelector('.gdi-scan-status');
                if(statusEl && state.status === 'scanning'){
                  const pct = (state.totalFolders > 0)
                    ? Math.round((state.scannedFolders||0)/state.totalFolders*100)
                    : 0;
                  statusEl.innerHTML = '<i class="bi bi-arrow-repeat"></i> Escaneando aulas... '+pct+'%';
                }else if(statusEl && state.status === 'done'){
                  statusEl.innerHTML = '<i class="bi bi-check2" style="color:#3fb950;"></i> '+((lessonsData && lessonsData.lessons && lessonsData.lessons.length)||0)+' aulas encontradas';
                  // Após 4s, esconde o status bar (mantém só contagem)
                  setTimeout(function(){
                    try{
                      const wrap = tile.querySelector('.gdi-scan-bar-wrap');
                      if(wrap){ wrap.style.transition='opacity .4s'; wrap.style.opacity='0'; }
                      const s2 = tile.querySelector('.gdi-scan-status');
                      if(s2){ s2.style.transition='opacity .4s'; s2.style.opacity='0'; }
                    }catch(_){}
                  }, 4000);
                }else if(statusEl && state.status === 'error'){
                  statusEl.innerHTML = '<i class="bi bi-exclamation-triangle" style="color:#ff8b8b;"></i> Erro ao escanear';
                }
              }
            }catch(_){}
          });
        }
      }catch(e){console.warn('[Scanner] não iniciado:',e.message);}

    }catch(e){
      console.error('[AddCourse] erro fatal em gdiAddCourseFromDrive:',e);
      if(window.showToast)showToast('Erro ao adicionar curso: '+e.message);
      // fecha modal mesmo com erro — não trava o aluno
      if(overlay&&overlay.parentNode)overlay.remove();
      throw e;
    }
  };

  // ★ PATCH G: o document-level capture-phase click listener para
  // #gdi-amc-select-current foi REMOVIDO. A captura agora é feita por
  // um listener anexado ao overlay quando showAddCourseModal() abre
  // (ver linha "overlay.addEventListener('click', ...)" dentro de
  // showAddCourseModal). Isso elimina o overhead de interceptar TODOS
  // os cliques no documento.

  let rescue=null,rescueAt=0;
  function ensureState(){
    if(rescue&&Date.now()-rescueAt<60000)return Promise.resolve(rescue);
    return fetch('/userstate',{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(j=>{
      if(j&&typeof j==='object'){rescue=j;rescueAt=Date.now();}
      return rescue;
    }).catch(()=>rescue);
  }
  function stateD(){
    try{if(window.GDIUser&&GDIUser.loaded()){const d=GDIUser.dump();if(d)return d;}}catch(_){}
    return rescue;
  }
  function watchedLow(d){
    const s=new Set();const w=(d&&d.watched)||{};
    for(const k in w)s.add(low(k));
    return s;
  }
  function courseKeyOf(p){
    const seg=norm(p).split('/').filter(Boolean);
    if(!seg.length||!/^\d+:$/.test(seg[0]))return null;
    if(seg.length<=2)return seg[0];
    return [seg[0],...seg.slice(1,-1).slice(0,2)].join('/');
  }
  const courseName=ck=>{
    // ★ Task 22: decodifica %20 e outros caracteres URL-encoded
    let name=ck.split('/').filter(Boolean).slice(1).join(' / ')||ck;
    try{name=decodeURIComponent(name);}catch(_){}
    return name;
  };
  function driveNameOf(ck){
    const m=/^\/(\d+):/.exec(ck||'');
    return(window.drive_names&&m&&window.drive_names[+m[1]])||'';
  }
  function collectCourses(){
    const d=stateD()||{};
    // ★ cursos ocultos pelo usuário (não aparecem na lista de cursos)
    const hidden=lsGet(LS_HIDDEN,[]);
    const isHidden=ck=>hidden.some(h=>low(h)===low(ck));

    // ★ FIX 2 (Task 14): return ONLY manually-added courses (no more auto-tiles).
    // Auto-tiles (de watched/resume/history) mostravam dados errados, ex.: "3 aulas"
    // quando o curso tem 50, porque c.lessons.size contava apenas paths visitados —
    // não o total real de aulas. Cursos manuais são adicionados explicitamente pelo
    // aluno via aba "Adicionar matéria" e carregam totalLessons (pdfCount do Drive scan).
    const LS_MANUAL='gdi-manual-courses-v1';
    const manual=lsGet(LS_MANUAL,[]);
    const map=new Map();

    // Pré-computa prefixo lower de cada curso manual para casar paths assistidos.
    // (Watched é armazenado por path completo; precisamos contar quantos paths
    //  assistidos caem dentro de cada curso manual.)
    const w=(d&&d.watched)||{};

    for(const m of manual){
      if(!m||!m.path)continue;
      const ck=m.path;  // usa o path do drive como courseKey
      if(isHidden(ck))continue;
      // Conta aulas assistidas (paths em d.watched cujo prefixo = course path)
      const pre=low(ck);
      let watchedCount=0;
      for(const k in w){
        const lk=low(k);
        if(lk===pre||lk.indexOf(pre+'/')===0)watchedCount++;
      }
      let c=map.get(ck);
      if(!c){
        c={
          key:ck,
          lastAt:m.createdAt||Date.now(),
          lessons:new Set(),  // mantido p/ compat (detail view itera d.watched direto)
          watched:watchedCount,
          manual:true,
          manualCourse:m,
          totalLessons:m.pdfCount||m.lessonCount||0  // ★ total real (Drive scan)
        };
        map.set(ck,c);
      }else{
        // curso já existia (raro em modo manual-only) — atualiza stats
        c.watched=watchedCount;
        c.totalLessons=m.pdfCount||m.lessonCount||0;
      }
      c.manual=true;
      c.manualCourse=m;
      if(!c.lastAt)c.lastAt=m.createdAt||Date.now();

      // ★ Task 15: enriquece com dados do Course Scanner (background, leve).
      //    - scanStatus: 'scanning' | 'done' | 'error' | null
      //    - scanPercent: 0-100 (proporção de pastas escaneadas)
      //    - totalLessons: sobrescrito se scanner já encontrou mais aulas que pdfCount
      //    - watched: recontado via GDIUser.dump() (mais confiável que stateD)
      if(window.gdiCourseScanner){
        try{
          const sp = window.gdiCourseScanner.getScanProgress(ck);
          if(sp){
            c.scanStatus = sp.status;
            c.scanPercent = sp.percent;
            c.scanLessonsFound = sp.lessonsFound;
            // Usa contagem REAL do scanner se for maior que pdfCount do add-time
            // (scanner conta vídeos recursivamente, pdfCount só contava PDFs do nível raiz)
            if(sp.lessonsFound > 0 && sp.lessonsFound > c.totalLessons){
              c.totalLessons = sp.lessonsFound;
            }
          }
          // Reconta watched usando GDIUser direto (mais fresco que stateD() rescue cache)
          const realWatched = window.gdiCourseScanner.countWatched(ck);
          if(typeof realWatched === 'number' && realWatched >= 0){
            c.watched = realWatched;
          }
        }catch(_){}
      }
    }

    return [...map.values()].sort((a,b)=>b.lastAt-a.lastAt);
  }
  // ★ Task 26: exporta collectCourses pra window (renderSimulado/renderRadar estão em IIFEs diferentes)
  window.__gdiCollectCourses = collectCourses;
  // ★ helpers para ocultar/restaurar cursos
  function hideCourse(ck){
    const hidden=lsGet(LS_HIDDEN,[]);
    if(!hidden.some(h=>low(h)===low(ck)))hidden.push(ck);
    lsSet(LS_HIDDEN,hidden);
  }
  function unhideCourse(ck){
    lsSet(LS_HIDDEN,lsGet(LS_HIDDEN,[]).filter(h=>low(h)!==low(ck)));
  }
  function listHiddenCourses(){
    return lsGet(LS_HIDDEN,[]);
  }
  const GW=/^(aula|aulas|v\u00eddeo|videos?|li[cç][aã]o|li[cç][oõ]es|licoes|lesson|class|modulo|m\u00f3dulo|module|parte|pt|cap|capitulo|ext|ep|live|arquivo|file)$/i;
  function isGeneric(n){
    n=stripExt(n).toLowerCase();if(!n)return true;
    return n.replace(/[\s\-_.:,;|()/\\]+/g,' ').split(' ')
      .filter(w2=>w2&&!/^\d+$/.test(w2)&&!GW.test(w2)&&!GW.test(w2.replace(/\d+$/,''))).join('')==='';
  }
  function realName(p){
    const seg=norm(p).split('/').filter(Boolean);
    let nm=stripExt(seg[seg.length-1]||'');
    if(isGeneric(nm))for(let j=seg.length-2;j>=0;j--){
      if(/^\d+:$/.test(seg[j]))break;
      if(!isGeneric(seg[j])){nm=stripExt(seg[j]);break;}
    }
    return nm||'Aula';
  }
  // ═══ PATCH B: vCache com LRU (1000 cap) + TTL (5min) + bestIn cache por curso (60s) ═══
  const vCache=new Map();
  const VCACHE_MAX=1000, VCACHE_TTL=5*60*1000;
  function vCacheGet(p){
    const e=vCache.get(p);
    if(!e)return null;
    if(Date.now()-e.t>VCACHE_TTL){vCache.delete(p);return null;}
    return e.v;  // pode ser Promise (in-flight) ou boolean (resolvido)
  }
  function vCacheSet(p,v){
    if(vCache.size>=VCACHE_MAX)vCache.delete(vCache.keys().next().value);
    vCache.set(p,{t:Date.now(),v});
  }
  function exists(p){
    const cached=vCacheGet(p);
    if(cached!==null)return cached instanceof Promise?cached:Promise.resolve(cached);
    const pr=fetch(String(p).split('?')[0],{method:'POST',credentials:'same-origin'})
      .then(r2=>{vCacheSet(p,r2.ok);return r2.ok})
      .catch(()=>{vCacheSet(p,true);return true});
    vCacheSet(p,pr);  // armazena Promise durante in-flight
    return pr;
  }
  const ghost=p=>{const s=norm(p).split('/').filter(Boolean);return s.length>=2&&s[s.length-1].indexOf(s[s.length-2]+' - ')===0;};
  // ★ bestInCache: courseKey -> {t, path} — TTL 60s
  const bestInCache=new Map();
  function bestIn(courseKey){
    const cached=bestInCache.get(courseKey);
    if(cached&&Date.now()-cached.t<60_000)return Promise.resolve(cached.path);
    const d=stateD();
    if(!d){bestInCache.set(courseKey,{t:Date.now(),path:null});return Promise.resolve(null);}
    const pre=low(courseKey);
    const inC=p=>{const l=low(p);return l===pre||l.indexOf(pre+'/')===0;};
    const cands=[],seen=new Set();
    const add=(k,at)=>{
      if(!k)return;const key=low(k);
      if(seen.has(key)||!inC(k))return;seen.add(key);
      cands.push({path:String(k).split('?')[0],at:Number(at)||0});
    };
    const w=(d&&d.watched)||{},r=(d&&d.resume)||{};
    for(const k in w)add(k,w[k]&&w[k].at);
    for(const k in r)add(k,r[k]&&r[k].at);
    if(d.last&&d.last.path)add(d.last.path,d.last.at);
    (Array.isArray(d.history)?d.history:[]).forEach(h=>{if(h&&h.path)add(h.path,h.at)});
    cands.sort((a,b)=>(ghost(a.path)-ghost(b.path))||(b.at-a.at));
    return (async()=>{
      for(const c of cands.slice(0,3)){
        let ex=vCacheGet(c.path);
        if(ex===null){ex=await exists(c.path);}  // exists() popula vCache internamente
        if(ex){bestInCache.set(courseKey,{t:Date.now(),path:c.path});return c.path;}
      }
      bestInCache.set(courseKey,{t:Date.now(),path:null});
      return null;
    })();
  }
  // ★ invalidar bestInCache quando usuário marcar/desmarcar vídeo
  Bus.onGlobal('watched:changed',()=>{bestInCache.clear();});

  let playing=false,mark=0;
  document.addEventListener('play',e=>{if(e.target&&e.target.tagName==='VIDEO'){playing=true;mark=Date.now();}},true);
  document.addEventListener('pause',e=>{if(e.target&&e.target.tagName==='VIDEO'){playing=false;flushWatch();}},true);
  document.addEventListener('ended',e=>{if(e.target&&e.target.tagName==='VIDEO'){playing=false;flushWatch();}},true);
  function flushWatch(){
    if(!mark)return;
    const sec=(Date.now()-mark)/1000;
    mark=playing?Date.now():0;
    if(sec>0&&sec<300){const w=lsGet(LS_WATCH,{});const k=dayKey();w[k]=(w[k]||0)+sec;lsSet(LS_WATCH,w);}
  }
  // ★ PATCH F: setInterval só roda quando há home-card visível OU painel aberto
  setInterval(()=>{
    if(document.getElementById('gdi-home-card')||(panel&&panel.style.display==='flex')){
      flushWatch();
    }
  },30000);
  const todayMin=()=>Math.round((lsGet(LS_WATCH,{})[dayKey()]||0)/60);
  const goalMin=()=>Math.max(10,Math.min(480,parseInt(lsGet(LS_GOAL,60),10)||60));
  function updateGoalChip(){
    const card=document.getElementById('gdi-home-card');
    if(!card)return;
    let chip=document.getElementById('gdi-goal-chip');
    if(!chip){
      chip=document.createElement('div');chip.id='gdi-goal-chip';
      chip.style.cssText='flex-basis:100%;margin-top:2px;font-size:12px;color:var(--ferreto-text-muted,#8b949e);display:flex;align-items:center;gap:8px;';
      card.appendChild(chip);
    }
    const t=todayMin(),g=goalMin();
    chip.innerHTML=`<span>\ud83c\udfaf Meta hoje: ${fmtMin(t)} / ${fmtMin(g)}</span>
      <div style="flex:1;max-width:220px;height:5px;background:var(--ferreto-surface-3,rgba(255,255,255,.1));border-radius:3px;overflow:hidden;">
        <div style="height:5px;width:${Math.min(100,Math.round(t/g*100))}%;background:${t>=g?'#2f9e44':'var(--ferreto-grad)'};transition:width .4s;"></div>
      </div>${t>=g?'<span style="color:#2f9e44;">\u2713 meta batida!</span>':''}`;
  }
  // ★ PATCH F: setInterval do goal-chip também gated
  setInterval(()=>{
    if(document.getElementById('gdi-home-card')||(panel&&panel.style.display==='flex')){
      updateGoalChip();
    }
  },20000);
  const marOn=()=>lsGet(LS_MAR,false)===true;
  const marIntro=()=>lsGet(LS_MARINTRO,true)!==false;
  function marCourseKey(){
    try{
      const m=window.playlistVideos&&window.playlistVideos[window.currentIndex];
      if(m&&m.folder){const f=norm(m.folder);return f.endsWith('/')?f:f+'/';}
    }catch(_){}
    return window.location.pathname.split('/').slice(0,-1).join('/')+'/';
  }
  Bus.onGlobal('media:ready',({type,el})=>{
    if(type!=='video'||!el||el.__m22mar)return;
    el.__m22mar=true;
    el.addEventListener('ended',()=>{
      if(!marOn())return;
      const pv=window.playlistVideos;
      if(!pv||!pv.length)return;
      const wl=watchedLow(stateD());
      const isW=i=>{
        const raw=String(pv[i].pageUrl||'').split('?')[0];
        if(wl.has(low(raw)))return true;
        try{return !!(window.GDIUser&&GDIUser.isWatched&&GDIUser.isWatched(raw));}catch(_){return false;}
      };
      const ci=typeof window.currentIndex==='number'?window.currentIndex:-1;
      for(let i=ci+1;i<pv.length;i++){
        if(!isW(i)){
          showToast('\u25b6 Maratona: '+stripExt(pv[i].name||pv[i].origName||''));
          setTimeout(()=>{try{window.switchVideo(i);}catch(_){}},1800);
          return;
        }
      }
      showToast('Maratona: todas as aulas \u00e0 frente j\u00e1 foram assistidas \u2713');
    });
    const tryIntro=()=>{
      if(!marOn()||!marIntro())return;
      try{
        const S=window.GDIUser&&GDIUser.getIntro&&GDIUser.getIntro(marCourseKey());
        if(S&&S>0&&el.currentTime<S-1&&el.currentTime<300)el.currentTime=S;
      }catch(_){}
    };
    el.addEventListener('loadedmetadata',()=>setTimeout(tryIntro,300));
    el.addEventListener('play',tryIntro);
  });
  const cards=()=>lsGet(LS_CARDS,[]);
  const saveCards=c=>lsSet(LS_CARDS,c);
  const dueCards=()=>cards().filter(c=>(c.due||0)<=Date.now());
  let FC={active:false,flip:null,grade:null};
  let panel=null,tab='home';
  // ★ PATCH D: openPanel faz UMA única renderização (depois do estado pronto)
  function openPanel(t){
    if(t)tab=t;
    if(!panel){
      panel=document.createElement('div');panel.id='gdi-central';
      panel.addEventListener('click',e=>{if(e.target===panel)closePanel();});
      GDI_ROOT().appendChild(panel);
    }
    panel.style.display='flex';
    // ★ uma única renderização: espera estado OU fallback em caso de erro
    ensureState().then(()=>{
      if(panel&&panel.style.display!=='none')renderPanel();
    }).catch(()=>renderPanel());
  }
  function closePanel(){
    FC.active=false;
    // ★ limpa timer do simulado se ativo (evita salvar simulado fantasma)
    const body=panel&&panel.querySelector('#gdi-central-body');
    if(body&&body.__simTimer){clearInterval(body.__simTimer);body.__simTimer=null;}
    if(panel)panel.style.display='none';
  }
  // ★ Expõe openPanel para outros módulos
  window.__gdiOpenCentral=openPanel;

  // ═══ PATCH E: renderSidebar() (1x) + renderBody(tab) (em cada troca de aba) ═══
  // ★ definição das abas agrupadas — tabs REMOVIDAS: cursos, mar, revisoes, fc, subjects, trails
  // REMOVIDO: tab cursos (Meus Cursos) — user request
  // REMOVIDO: tab mar (Maratona) — user request
  // REMOVIDO: tab revisoes (Revisões) — user request
  // REMOVIDO: tab fc (Flashcards) — user request
  // REMOVIDO: tab subjects (Matérias) — user request
  // REMOVIDO: tab trails (Trilhas) — user request
  // (renderCursos/renderMarathon/renderRevisoes/renderFlash/renderSubjects/renderTrails
  //  permanecem definidos como funções para preservar a API pública — window.* e GDI_MODULES.)
  const TAB_GROUPS=[
    {label:null,tabs:[
      {id:'home',icon:'bi-house-door',label:'Início'}
    ]},
    {label:'Praticar',tabs:[
      {id:'questoes',icon:'bi-patch-question',label:'Questões'},
      {id:'simulado',icon:'bi-stopwatch',label:'Simulado'}
    ]},
    {label:'Materiais',tabs:[
      {id:'addmateria',icon:'bi-folder-plus',label:'Adicionar matéria'},  // ★ FIX 1a (Task 14): RE-ADICIONADO — user pediu para voltar
      {id:'resumos',icon:'bi-clipboard',label:'Resumos'},
      {id:'provas',icon:'bi-file-earmark-text',label:'Provas'},
      {id:'redacao',icon:'bi-pencil-square',label:'Redação'}
    ]},
    {label:'Planejar',tabs:[
      {id:'cronograma',icon:'bi-calendar3',label:'Cronograma'},
      {id:'stats',icon:'bi-graph-up',label:'Estatísticas'},
      {id:'radar',icon:'bi-bullseye',label:'Mapa de Fracos'},
      {id:'achievements',icon:'bi-trophy',label:'Conquistas'}
    ]}
  ];

  // ★ monta a sidebar 1x (HTML estático — só badges dinâmicos)
  function renderSidebarHTML(dueCount){
    return `<aside class="gdi-central-sidebar">
      ${TAB_GROUPS.map(group=>`
        <div class="gdi-central-sidebar-group">
          ${group.label?`<div class="gdi-central-sidebar-label">${group.label}</div>`:''}
          ${group.tabs.map(t=>`
            <button class="gdi-central-tab" data-t="${t.id}">
              <i class="bi ${t.icon}"></i>
              <span>${t.label}</span>
              ${t.badge?`<span class="gdi-tab-badge">${t.badge}</span>`:''}
            </button>
          `).join('')}
        </div>
      `).join('')}
    </aside>`;
  }

  // ★ monta o header (1x); stats são atualizadas via updateHeaderStats()
  function renderHeaderHTML(streak,t,g,dueCount){
    return `<div class="gdi-central-head">
      <div class="gdi-central-head-title">
        <span class="gdi-central-icon">📚</span>
        <b>Área do Aluno</b>
      </div>
      <div class="gdi-central-stats">
        <span class="gdi-central-stat" title="Sequência de dias estudando">
          <i class="bi bi-fire gdi-stat-fire"></i>
          <b id="gdi-stat-streak">${streak}</b><span style="color:var(--ferreto-text-muted,#8b949e);">dias</span>
        </span>
        <span class="gdi-central-stat" title="Tempo estudado hoje">
          <i class="bi bi-clock gdi-stat-time"></i>
          <b id="gdi-stat-time">${fmtMin(t)}</b><span style="color:var(--ferreto-text-muted,#8b949e);">/${fmtMin(g)}</span>
        </span>
        ${dueCount?`<span class="gdi-central-stat" title="Flashcards para revisar hoje">
          <i class="bi bi-card-text gdi-stat-cards"></i>
          <b id="gdi-stat-cards">${dueCount}</b><span style="color:var(--ferreto-text-muted,#8b949e);">cards</span>
        </span>`:''}
      </div>
      <input id="gdi-goal-set" type="number" min="10" max="480" value="${g}" title="Meta diária (minutos)" style="width:56px;background:var(--ferreto-surface-2,rgba(255,255,255,.07));border:1px solid var(--ferreto-border,#30363d);border-radius:6px;color:var(--ferreto-text,#f0f6fc);text-align:center;padding:5px;font-size:12px;flex-shrink:0;">
      <button id="gdi-central-x" title="Fechar (Esc)">✕</button>
    </div>`;
  }

  // ★ atualiza só os números de stats (não recria o header inteiro)
  function updateHeaderStats(){
    if(!panel)return;
    const t=todayMin(),g=goalMin();
    const cardsArr=lsGet(LS_CARDS,[]);
    const dueCount=cardsArr.filter(c=>(c.due||0)<=Date.now()).length;
    const watch=lsGet(LS_WATCH,{});
    const acts={};const touch=ts=>{if(ts){const k=new Date(ts).toDateString();acts[k]=(acts[k]||0)+1;}};
    for(const k in watch){const v=watch[k];if(typeof v==='number'&&v>60)touch(new Date(k+'T12:00:00').getTime());else if(v&&v.at)touch(v.at);}
    let streak=0;const dd=new Date();const has=x=>acts[x.toDateString()];
    if(!has(dd))dd.setDate(dd.getDate()-1);
    while(has(dd)){streak++;dd.setDate(dd.getDate()-1);}
    const sEl=panel.querySelector('#gdi-stat-streak');
    if(sEl)sEl.textContent=streak;
    const tEl=panel.querySelector('#gdi-stat-time');
    if(tEl)tEl.textContent=fmtMin(t);
    const cEl=panel.querySelector('#gdi-stat-cards');
    if(cEl)cEl.textContent=dueCount;
  }

  // ★ renderBody(tab) — só o corpo da aba, sem rebuild do sidebar/header
  function renderBody(currentTab){
    if(!panel)return;
    const body=panel.querySelector('#gdi-central-body');
    if(!body)return;
    // limpa timer do simulado anterior se houver
    if(body.__simTimer){clearInterval(body.__simTimer);body.__simTimer=null;}
    // ★ FIX 1b (Task 14): RE-ADICIONADO handler da aba 'addmateria' (Task 13 havia removido por engano)
    if(currentTab==='addmateria'){showAddCourseModal(body);return;}
    if(currentTab==='home')renderHome(body);
    else if(currentTab==='questoes')renderQuestoes(body);
    else if(currentTab==='simulado')renderSimulado(body);
    else if(currentTab==='cronograma')renderCronograma(body);
    else if(currentTab==='resumos'){if(window.renderResumos)renderResumos(body);else body.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">📋</span><h3>Resumos indisponíveis</h3><p>O módulo de resumos não carregou. Tente recarregar a página.</p></div>';}
    else if(currentTab==='provas'){if(window.renderProvas)window.renderProvas(body);else body.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">📄</span><h3>Provas indisponíveis</h3><p>O módulo de provas não carregou.</p></div>';}
    else if(currentTab==='redacao'){if(window.renderRedacao)window.renderRedacao(body);else body.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">✍️</span><h3>Redação indisponível</h3><p>O módulo de redação não carregou.</p></div>';}
    else if(currentTab==='radar'){if(window.renderRadar)window.renderRadar(body);else body.innerHTML='<div class="gdi-empty-state"><span class="gdi-empty-state-icon">🎯</span><h3>Radar indisponível</h3><p>O módulo de radar não carregou.</p></div>';}
    else if(currentTab==='stats')renderStats(body);
    else if(currentTab==='achievements')renderAchievements(body);
    // REMOVIDO: tabs cursos/mar/revisoes/fc/subjects/trails não têm mais handler
    // (funções renderCursos/renderMarathon/renderRevisoes/renderFlash/renderSubjects/renderTrails
    //  permanecem definidas abaixo para preservar a API pública)
    else body.innerHTML='<div class="gdi-notes-empty">Aba inválida.</div>';
  }

  function renderPanel(){
    if(!panel)return;
    const t=todayMin(),g=goalMin();
    const cardsArr=lsGet(LS_CARDS,[]);
    const dueCount=cardsArr.filter(c=>(c.due||0)<=Date.now()).length;
    const watch=lsGet(LS_WATCH,{});
    const acts={};const touch=ts=>{if(ts){const k=new Date(ts).toDateString();acts[k]=(acts[k]||0)+1;}};
    for(const k in watch){const v=watch[k];if(typeof v==='number'&&v>60)touch(new Date(k+'T12:00:00').getTime());else if(v&&v.at)touch(v.at);}
    let streak=0;const dd=new Date();const has=x=>acts[x.toDateString()];
    if(!has(dd))dd.setDate(dd.getDate()-1);
    while(has(dd)){streak++;dd.setDate(dd.getDate()-1);}
    // ★ PATCH E: só rebuilda sidebar+header na 1ª vez; nas seguintes, atualiza stats e re-renderiza body
    if(!panel.dataset.sidebarRendered){
      panel.innerHTML=`<div class="gdi-central-box">
        ${renderHeaderHTML(streak,t,g,dueCount)}
        <div class="gdi-central-main">
          ${renderSidebarHTML(dueCount)}
          <div class="gdi-central-body" id="gdi-central-body"></div>
        </div>
      </div>`;
      panel.dataset.sidebarRendered='1';
      // bind header
      panel.querySelector('#gdi-central-x').onclick=closePanel;
      panel.querySelector('#gdi-goal-set').addEventListener('change',e=>{
        const v=Math.max(10,Math.min(480,parseInt(e.target.value,10)||60));
        lsSet(LS_GOAL,v);
        updateHeaderStats();  // só atualiza o número, não rebuilda
      });
      // bind tabs — SÓ chama renderBody (não rebuilda sidebar)
      panel.querySelectorAll('.gdi-central-tab').forEach(b=>b.onclick=function(){
        panel.querySelectorAll('.gdi-central-tab').forEach(x=>x.classList.remove('active'));
        this.classList.add('active');
        tab=this.dataset.t;FC.active=false;
        renderBody(tab);
      });
    }else{
      // atualiza stats inline (não rebuilda)
      updateHeaderStats();
    }
    // ativa a tab atual no sidebar
    panel.querySelectorAll('.gdi-central-tab').forEach(b=>b.classList.toggle('active',b.dataset.t===tab));
    renderBody(tab);
  }

  // ★ Dashboard "Início" — visão geral com atalhos
  // (cards de cursos/flashcards/matérias REMOVIDOS pois as abas foram removidas)
  function renderHome(box){
    const t=todayMin(),g=goalMin(),pct=Math.min(100,Math.round(t/g*100));
    const cards=lsGet(LS_CARDS,[]);
    const dueCount=cards.filter(c=>(c.due||0)<=Date.now()).length;
    const courses=(window.__gdiCollectCourses||function(){return []})();
    // usa localStorage direto (M23 está em escopo diferente)
    const questionsCount=lsGet('gdi-questions-v1',[]).length;
    const simuladosCount=lsGet('gdi-simulados-v1',[]).length;
    const achievements=window.gdiAchievements?window.gdiAchievements.getUnlocked().length:0;
    const totalAchievements=window.gdiAchievements?window.gdiAchievements.defs().length:0;
    const hour=new Date().getHours();
    const greeting=hour<12?'Bom dia':hour<18?'Boa tarde':'Boa noite';

    box.innerHTML=`
      <div class="gdi-dashboard-hero">
        <h2>${greeting}! 👋</h2>
        <p>${t>=g?'<b style="color:#3fb950;">Meta batida hoje!</b> Parabéns, continue assim. 🎉':'Continue estudando para bater sua meta diária.'}</p>
        <div style="margin-top:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="flex:1;min-width:200px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ferreto-text-muted,#8b949e);margin-bottom:4px;">
              <span>Progresso de hoje</span>
              <span><b style="color:var(--ferreto-text,#f0f6fc);">${fmtMin(t)}</b> / ${fmtMin(g)}</span>
            </div>
            <div class="gdi-progress-bar" style="margin:0;"><div class="gdi-progress-fill" style="width:${pct}%;${t>=g?'background:#3fb950':''}"></div></div>
          </div>
        </div>
      </div>

      <div class="gdi-dashboard-grid">
        <div class="gdi-dashboard-card" data-action="questoes">
          <span class="gdi-dashboard-card-icon">📝</span>
          <span class="gdi-dashboard-card-num">${questionsCount}</span>
          <span class="gdi-dashboard-card-label">Questões no banco</span>
          <span class="gdi-dashboard-card-meta">${dueCount} cards p/ revisar</span>
        </div>
        <div class="gdi-dashboard-card" data-action="simulado">
          <span class="gdi-dashboard-card-icon">⏱️</span>
          <span class="gdi-dashboard-card-num">${simuladosCount}</span>
          <span class="gdi-dashboard-card-label">Simulados feitos</span>
          <span class="gdi-dashboard-card-meta">Pratique sob pressão</span>
        </div>
        <div class="gdi-dashboard-card" data-action="provas">
          <span class="gdi-dashboard-card-icon">📄</span>
          <span class="gdi-dashboard-card-num">${courses.length}</span>
          <span class="gdi-dashboard-card-label">Cursos em andamento</span>
          <span class="gdi-dashboard-card-meta">Analise provas anteriores</span>
        </div>
        <div class="gdi-dashboard-card" data-action="achievements">
          <span class="gdi-dashboard-card-icon">🏆</span>
          <span class="gdi-dashboard-card-num">${achievements}</span>
          <span class="gdi-dashboard-card-label">Conquistas</span>
          <span class="gdi-dashboard-card-meta">de ${totalAchievements} possíveis</span>
        </div>
      </div>

      <div style="margin-bottom:20px;">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;display:block;margin-bottom:10px;">Atalhos rápidos</b>
        <div class="gdi-quick-actions">
          <button class="gdi-quick-action" data-action="questoes"><i class="bi bi-patch-question"></i> Resolver questões</button>
          <button class="gdi-quick-action" data-action="simulado"><i class="bi bi-stopwatch"></i> Fazer simulado</button>
          <button class="gdi-quick-action" data-action="provas"><i class="bi bi-file-earmark-text"></i> Provas anteriores</button>
          <button class="gdi-quick-action" data-action="redacao"><i class="bi bi-pencil-square"></i> Corrigir redação</button>
          <button class="gdi-quick-action" data-action="cronograma"><i class="bi bi-calendar3"></i> Cronograma</button>
          <button class="gdi-quick-action" data-action="resumos"><i class="bi bi-clipboard"></i> Ver resumos</button>
        </div>
      </div>

      ${courses.length?`
      <div>
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;display:block;margin-bottom:10px;">Continue de onde parou</b>
        <div class="gdi-courses">
          ${courses.slice(0,6).map(c=>{
            const name=cleanCourseName(c.key);
            const drive=driveNameOf(c.key);
            // ★ FIX 3 (Task 14): usa totalLessons (real) ao invés de c.lessons.size (visited paths)
            const total=c.totalLessons||c.lessons.size||0;
            const watched=c.watched||0;
            const remaining=Math.max(0,total-watched);  // ★ nunca negativo
            const progress=total>0?Math.min(100,Math.round(watched/total*100)):(watched>0?100:0);
            const progressColor=progress>=80?'#3fb950':progress>=40?'#ffd43b':'var(--ferreto-primary,#ff8b9f)';
            const coursePath=c.key;  // e.g. /4:/CANTE COM EXCELENCIA 2.0 + COMUNIDADE/
            return `<div class="gdi-course" data-course-key="${escHtml(c.key)}" style="cursor:pointer;">
              <b title="${escHtml(courseName(c.key))}">${escHtml(name)}</b>
              ${drive?`<small><i class="bi bi-hdd"></i> ${escHtml(drive)}</small>`:'<small>&nbsp;</small>'}
              <div class="gdi-course-stats">
                <div class="gdi-course-stat"><span class="gdi-course-stat-num" data-stat="total">${total}</span><span class="gdi-course-stat-label">Aulas</span></div>
                <div class="gdi-course-stat"><span class="gdi-course-stat-num" data-stat="watched" style="color:#3fb950;">${watched}</span><span class="gdi-course-stat-label">Assistidas</span></div>
                <div class="gdi-course-stat"><span class="gdi-course-stat-num" data-stat="remaining" style="color:#ffd43b;">${remaining}</span><span class="gdi-course-stat-label">Restantes</span></div>
                <div class="gdi-course-stat"><span class="gdi-course-stat-num" data-stat="progress" style="color:${progressColor};">${progress}%</span><span class="gdi-course-stat-label">Concluído</span></div>
              </div>
              <div class="gdi-progress-bar"><div class="gdi-progress-fill" style="width:${progress}%;background:${progressColor};"></div></div>
              ${(c.scanStatus==='scanning'||c.scanStatus==='done'||c.scanStatus==='error')?`
              <div class="gdi-scan-bar-wrap" style="margin-top:6px;height:3px;background:var(--ferreto-surface-2,rgba(255,255,255,.08));border-radius:2px;overflow:hidden;">
                <div class="gdi-scan-progress" style="height:100%;width:${c.scanPercent||0}%;background:var(--ferreto-secondary,#5ddeda);transition:width .3s;" title="Escaneando: ${c.scanPercent||0}%"></div>
              </div>
              <small class="gdi-scan-status" style="color:var(--ferreto-text-muted,#8b949e);font-size:10px;display:block;margin-top:2px;">
                ${c.scanStatus==='scanning'
                  ? '<i class="bi bi-arrow-repeat"></i> Escaneando aulas... '+(c.scanPercent||0)+'%'
                  : c.scanStatus==='done'
                    ? '<i class="bi bi-check2" style="color:#3fb950;"></i> '+(c.scanLessonsFound||0)+' aulas encontradas'
                    : '<i class="bi bi-exclamation-triangle" style="color:#ff8b8b;"></i> Erro ao escanear'}
              </small>`:''}
              <div style="display:flex;gap:6px;margin-top:8px;">
                <button class="gdi-btn-continue" data-course-key="${escHtml(c.key)}" style="flex:1;" disabled><i class="bi bi-hourglass-split"></i> Verificando…</button>
                <a href="${escHtml(coursePath)}" class="gdi-btn-continue" style="flex:1;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;" title="Abrir pasta no Drive"><i class="bi bi-folder2-open"></i> Ir para o Drive</a>
              </div>
              ${/* ★ Task 16 / FIX 2: botão "Escanear agora" manual */ ''}
              ${(!c.scanStatus || c.scanStatus === 'error') ? `
              <div style="display:flex;gap:6px;margin-top:6px;">
                <button class="gdi-btn-scan-now" data-course-key="${escHtml(c.key)}" style="flex:1;font-size:11px;padding:6px 10px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-secondary,#5ddeda);border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;" title="Escanear aulas do curso">
                  <i class="bi bi-arrow-repeat"></i> Escanear agora
                </button>
              </div>` : ''}
              ${c.scanStatus === 'scanning' ? `
              <div style="display:flex;gap:6px;margin-top:6px;">
                <button class="gdi-btn-scan-now" disabled style="flex:1;font-size:11px;padding:6px 10px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);color:var(--ferreto-text-muted,#8b949e);border-radius:8px;cursor:default;display:inline-flex;align-items:center;justify-content:center;gap:6px;opacity:.7;">
                  <i class="bi bi-hourglass-split"></i> Escaneando ${c.scanPercent||0}%
                </button>
              </div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>`:''}
    `;

    // bind quick actions (todas apontam para abas que ainda existem)
    box.querySelectorAll('[data-action]').forEach(el=>{
      el.onclick=()=>{
        tab=el.dataset.action;
        // ativa tab visualmente
        panel.querySelectorAll('.gdi-central-tab').forEach(b=>b.classList.toggle('active',b.dataset.t===tab));
        renderBody(tab);
      };
    });
    // bind course cards (continue) — clicar leva a openCourseDetail
    // ★ FIX 3 (Task 14): <a> "Ir para o Drive" também tem classe .gdi-btn-continue;
    //   usar selector específico p/ só pegar o <button> Continuar, e ignorar clicks em <a>.
    box.querySelectorAll('[data-course-key]').forEach(cardEl=>{
      const ck=cardEl.dataset.courseKey;
      const contBtn=cardEl.querySelector('button.gdi-btn-continue');
      bestIn(ck).then(target=>{
        if(target){
          if(contBtn){
            contBtn.disabled=false;
            contBtn.innerHTML=`<i class="bi bi-play-fill"></i> Continuar: ${escHtml(realName(target).slice(0,30))}`;
            contBtn.onclick=(e)=>{e.stopPropagation();location.href=target+(target.includes('?')?'&':'?')+'a=view';};
          }
        }else{
          if(contBtn){
            contBtn.disabled=true;
            contBtn.className='gdi-btn-continue gdi-btn-done';
            contBtn.innerHTML='<i class="bi bi-check2-all"></i> Tudo em dia!';
          }
        }
      });
      cardEl.onclick=(e)=>{
        // ★ ignora clicks em <button> OU <a> (Drive link navega sozinho)
        if(e.target.closest('button'))return;
        if(e.target.closest('a'))return;
        // abre detalhe do curso (função preservada — tab cursos removida mas função fica)
        const c=courses.find(x=>x.key===ck);
        if(c)openCourseDetail(box,c);
      };
      // ★ Task 16 / FIX 2: botão "Escanear agora" — dispara scanner manualmente
      const scanBtn = cardEl.querySelector('.gdi-btn-scan-now');
      if(scanBtn && !scanBtn.disabled){
        scanBtn.addEventListener('click', function(e){
          e.stopPropagation();
          const ckScan = this.dataset.courseKey;
          if(ckScan && window.gdiCourseScanner){
            // Limpa estado anterior (caso tenha sido 'error') e inicia novo scan
            window.gdiCourseScanner.clearScanState(ckScan);
            // Feedback imediato: troca texto do botão
            try{
              this.disabled = true;
              this.style.opacity = '.7';
              this.innerHTML = '<i class="bi bi-hourglass-split"></i> Iniciando…';
            }catch(_){}
            window.gdiCourseScanner.startScan(ckScan, function(state, lessonsData){
              // Atualiza tile se ainda visível
              try{
                if(state.status === 'scanning'){
                  const pct = (state.totalFolders > 0)
                    ? Math.round((state.scannedFolders||0)/state.totalFolders*100)
                    : 0;
                  if(scanBtn && scanBtn.isConnected){
                    scanBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Escaneando '+pct+'%';
                  }
                  // Atualiza barra de progresso + stats
                  const bar = cardEl.querySelector('.gdi-scan-progress');
                  if(bar) bar.style.width = pct + '%';
                  const totalEl = cardEl.querySelector('[data-stat="total"]');
                  if(totalEl && lessonsData && lessonsData.lessons){
                    totalEl.textContent = lessonsData.lessons.length;
                  }
                }else if(state.status === 'done' || state.status === 'error'){
                  // Re-renderiza home para atualizar tile com estado final
                  const body = document.getElementById('gdi-central-body');
                  if(body && window.__gdiCurrentTab === 'home' && typeof renderHome === 'function'){
                    try{ renderHome(body); }catch(_){}
                  }
                }
              }catch(_){}
            });
          }
        });
      }
    });
  }

  // ★ Aba "Conquistas" — gamificação
  function renderAchievements(box){
    if(!window.gdiAchievements){
      box.innerHTML='<div class="gdi-notes-empty">Sistema de conquistas indisponível.</div>';
      return;
    }
    const unlocked=window.gdiAchievements.getUnlocked();
    const defs=window.gdiAchievements.defs();
    const total=defs.length;
    const pct=Math.round(unlocked.length/total*100);
    box.innerHTML=`<div style="max-width:760px;">
      <div style="text-align:center;margin-bottom:20px;padding:20px;background:linear-gradient(135deg,rgba(255,139,159,.1),rgba(93,222,218,.06));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;">
        <div style="font-size:48px;margin-bottom:8px;">🏆</div>
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:18px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);">Conquistas</b>
        <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:6px 0 0;">${unlocked.length} de ${total} desbloqueadas · ${pct}% completo</p>
        <div style="height:8px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:4px;overflow:hidden;margin:14px auto 0;max-width:300px;">
          <div style="height:8px;width:${pct}%;background:var(--ferreto-grad);border-radius:4px;transition:width .4s;"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">
        ${defs.map(d=>{
          const isUnlocked=unlocked.includes(d.id);
          return `<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid ${isUnlocked?'rgba(63,185,80,.3)':'var(--ferreto-border,#21262d)'};border-radius:12px;padding:14px;text-align:center;${isUnlocked?'':'opacity:.5;'}">
            <div style="font-size:32px;margin-bottom:6px;${isUnlocked?'':'filter:grayscale(1);'}">${d.icon}</div>
            <b style="color:${isUnlocked?'#3fb950':'var(--ferreto-text-muted,#8b949e)'};font-size:13px;display:block;">${escHtml(d.title)}</b>
            <small style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;display:block;margin-top:4px;line-height:1.4;">${escHtml(d.desc)}</small>
            ${isUnlocked?'<div style="font-size:10px;color:#3fb950;margin-top:6px;font-weight:600;">✓ DESBLOQUEADA</div>':'<div style="font-size:10px;color:var(--ferreto-text-faint,#6b7488);margin-top:6px;">bloqueada</div>'}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // ★ Otimização: limpa nome do curso (remove paths crus, underscores, etc)
  function cleanCourseName(ck){
    let name=courseName(ck);
    // se veio vazio, usa o drive name
    if(!name||name==='—')name=driveNameOf(ck)||'Curso';
    // ★ Task 22: decodifica %20 se ainda não foi decodificado
    try{if(name.indexOf('%')>=0)name=decodeURIComponent(name);}catch(_){}
    // remove underscores → espaços, multiple slashes, trim
    name=name.replace(/_/g,' ').replace(/\/\s*\//g,' / ').replace(/\s+/g,' ').trim();
    // se muito longo, trunca
    if(name.length>45)name=name.slice(0,42)+'…';
    return name;
  }

  // ★ REMOVIDO: tab cursos (user request) — função MANTIDA para preservar API pública
  // (window.renderCursos e window.gdiRefreshCentralPanel podem ser chamados por outros módulos)
  async function renderCursos(box){
    const cs=(window.__gdiCollectCourses||function(){return []})();
    const hidden=listHiddenCourses();
    if(!cs.length){
      box.innerHTML=`<div class="gdi-empty-state">
        <span class="gdi-empty-state-icon">🎓</span>
        <h3>Nenhum estudo registrado ainda</h3>
        <p>Assista uma aula para que ela apareça aqui automaticamente, ou crie um curso manual para organizar seus estudos.</p>
        <div class="gdi-quick-actions" style="justify-content:center;margin-bottom:20px;">
          <button id="gdi-empty-add-course" class="gdi-quick-action"><i class="bi bi-plus-lg"></i> Adicionar curso manual</button>
        </div>
        ${hidden.length?`<div style="margin-top:24px;padding:14px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;text-align:left;max-width:400px;margin-left:auto;margin-right:auto;">
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;display:block;margin-bottom:8px;"><i class="bi bi-eye-slash"></i> ${hidden.length} curso${hidden.length>1?'s':''} oculto${hidden.length>1?'s':''}</b>
          <button id="gdi-restore-courses" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-arrow-counterclockwise"></i> Restaurar cursos ocultos</button>
        </div>`:''}
      </div>`;
      const emptyAdd=box.querySelector('#gdi-empty-add-course');
      if(emptyAdd)emptyAdd.onclick=()=>showAddCourseModal(box);
      const restoreBtn=box.querySelector('#gdi-restore-courses');
      if(restoreBtn)restoreBtn.onclick=async ()=>{
        const ok=await window.gdiModal({
          title:'Restaurar cursos',
          message:'Restaurar todos os '+hidden.length+' curso(s) oculto(s)?',
          confirmText:'Restaurar',
          cancelText:'Cancelar'
        });
        if(ok){
          lsSet(LS_HIDDEN,[]);
          showToast('Cursos restaurados');
          renderCursos(box);
        }
      };
      return;
    }
    box.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
      <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;">${cs.length} curso${cs.length>1?'s':''} em andamento</b>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button id="gdi-add-manual-course" class="gdi-mode-btn" style="font-size:11px;"><i class="bi bi-plus-lg"></i> Adicionar curso</button>
        ${hidden.length?`<button id="gdi-show-hidden" class="gdi-mode-btn" style="font-size:11px;"><i class="bi bi-eye-slash"></i> ${hidden.length} oculto${hidden.length>1?'s':''}</button>`:''}
      </div>
    </div>
    <div style="margin-bottom:14px;">
      <input id="gdi-courses-search" type="search" placeholder="Buscar curso..." style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:9px 12px;font-size:13px;font-family:inherit;" value="${escHtml(box.__search||'')}">
    </div>
    <div class="gdi-courses"></div>
    <div id="gdi-courses-pager" style="margin-top:14px;text-align:center;"></div>`;
    const grid=box.querySelector('.gdi-courses');
    const pagerEl=box.querySelector('#gdi-courses-pager');
    const searchInput=box.querySelector('#gdi-courses-search');

    // ★ botão "Adicionar curso manual"
    const addManualBtn=box.querySelector('#gdi-add-manual-course');
    if(addManualBtn)addManualBtn.onclick=()=>showAddCourseModal(box);

    // ★ botão "mostrar ocultos"
    const showHiddenBtn=box.querySelector('#gdi-show-hidden');
    if(showHiddenBtn)showHiddenBtn.onclick=()=>showHiddenCoursesModal(box);

    // ★ busca + paginação (12 por página)
    const PAGE_SIZE=12;
    let currentPage=box.__page||0;
    function applyFilter(){
      const q=(box.__search||'').toLowerCase().trim();
      const filtered=q?cs.filter(c=>cleanCourseName(c.key).toLowerCase().includes(q)||driveNameOf(c.key).toLowerCase().includes(q)):cs;
      const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
      if(currentPage>=totalPages)currentPage=totalPages-1;
      if(currentPage<0)currentPage=0;
      const slice=filtered.slice(currentPage*PAGE_SIZE,(currentPage+1)*PAGE_SIZE);
      // limpar grid
      grid.innerHTML='';
      if(!slice.length){
        grid.innerHTML='<div class="gdi-notes-empty" style="padding:40px;text-align:center;">'+(q?'Nenhum curso encontrado para "'+escHtml(q)+'"':'Nenhum curso ainda.')+'</div>';
      }
      // ★ PATCH C: pré-busca bestIn em paralelo (Promise.all) — depois renderiza cards com target resolvido
      (async()=>{
        const targets=await Promise.all(slice.map(c=>bestIn(c.key).catch(()=>null)));
        slice.forEach((c,i)=>renderCourseCard(grid,c,box,targets[i]));
      })();
      // paginação
      if(totalPages>1){
        pagerEl.innerHTML=`<div style="display:flex;gap:6px;justify-content:center;align-items:center;flex-wrap:wrap;">
          <button class="gdi-mode-btn" id="gdi-courses-prev" style="font-size:11px;padding:5px 10px;" ${currentPage===0?'disabled':''}><i class="bi bi-chevron-left"></i> Anterior</button>
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Página ${currentPage+1} de ${totalPages}</span>
          <button class="gdi-mode-btn" id="gdi-courses-next" style="font-size:11px;padding:5px 10px;" ${currentPage===totalPages-1?'disabled':''}>Próxima <i class="bi bi-chevron-right"></i></button>
        </div>
        <div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-top:6px;">Mostrando ${slice.length} de ${filtered.length} curso${filtered.length>1?'s':''}${q?' (filtrado por "'+escHtml(q)+'")':''}</div>`;
        const prev=pagerEl.querySelector('#gdi-courses-prev');
        const next=pagerEl.querySelector('#gdi-courses-next');
        if(prev)prev.onclick=()=>{currentPage--;applyFilter();};
        if(next)next.onclick=()=>{currentPage++;applyFilter();};
      }else{
        pagerEl.innerHTML=filtered.length>PAGE_SIZE?`<div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">Mostrando ${slice.length} de ${filtered.length} cursos</div>`:'';
      }
    }
    function renderCourseCard(grid,c,box,target){
      // ★ FIX: cursos manuais usam dados do manualCourse (nome, ícone, cor)
      const mc=c.manualCourse||{};
      // ★ FIX 1 (Task 23): decode URL-encoded mc.name defensively.
      // Legacy localStorage entries (saved before Task 22) may have %20 in
      // the name field (e.g. "TJ%20SP%20-%20Black%20Edition"). Decode here so
      // the tile shows "TJ SP - Black Edition" regardless of when it was saved.
      // Idempotent: decodeURIComponent of an already-decoded string is a no-op.
      let _mcName=mc.name||'';
      try{if(_mcName&&String(_mcName).indexOf('%')>=0)_mcName=decodeURIComponent(_mcName);}catch(_){}
      const name=_mcName||cleanCourseName(c.key);
      const drive=driveNameOf(c.key);
      const icon=mc.icon||'📁';
      const color=mc.color||'var(--ferreto-primary,#ff8b9f)';
      const isManual=c.manual===true;
      const progress=c.lessons.size>0?Math.round(c.watched/c.lessons.size*100):0;
      const progressColor=progress>=80?'#3fb950':progress>=40?'#ffd43b':'var(--ferreto-primary,#ff8b9f)';
      const remaining=c.lessons.size-c.watched;
      const el=document.createElement('div');el.className='gdi-course';
      el.style.cursor='pointer';
      // ★ destaque visual para curso manual: border-left com a cor do manualCourse
      if(isManual)el.style.borderLeft='4px solid '+color;
      el.innerHTML=`
        <div class="gdi-course-head" style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <b title="${escHtml(_mcName||courseName(c.key))}" style="flex:1;min-width:0;display:flex;align-items:center;gap:6px;">
            ${isManual?`<span style="font-size:18px;flex:none;">${icon}</span>`:''}
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(name)}</span>
          </b>
          <button class="gdi-course-remove" title="${isManual?'Remover curso manual':'Ocultar curso'}" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:14px;padding:2px 6px;flex:none;border-radius:6px;transition:all .15s;"><i class="bi bi-x-lg"></i></button>
        </div>
        ${isManual
          ? `<small style="color:var(--ferreto-secondary,#5ddeda);font-size:10px;display:block;margin-top:4px;"><i class="bi bi-hdd"></i> ${escHtml(drive||'Drive')} · <span style="color:#ffd43b;"><i class="bi bi-hourglass-split"></i> Meggy processando…</span></small>`
          : (drive?`<small style="color:var(--ferreto-secondary,#5ddeda);font-size:10px;display:block;margin-top:2px;"><i class="bi bi-hdd"></i> ${escHtml(drive)}${c.lastAt?` · última: ${dateBr(c.lastAt)}`:''}</small>`:'<small>&nbsp;</small>')
        }
        <div class="gdi-course-stats">
          ${isManual
            ? `<div class="gdi-course-stat"><span class="gdi-course-stat-num" style="color:#ffd43b;">…</span><span class="gdi-course-stat-label">Batalhão</span></div>
               <div class="gdi-course-stat"><span class="gdi-course-stat-num">0</span><span class="gdi-course-stat-label">Assistidas</span></div>`
            : `<div class="gdi-course-stat"><span class="gdi-course-stat-num">${c.lessons.size}</span><span class="gdi-course-stat-label">Aulas</span></div>
               <div class="gdi-course-stat"><span class="gdi-course-stat-num" style="color:#3fb950;">${c.watched}</span><span class="gdi-course-stat-label">Feitas</span></div>
               <div class="gdi-course-stat"><span class="gdi-course-stat-num" style="color:#ffd43b;">${remaining}</span><span class="gdi-course-stat-label">Restam</span></div>
               <div class="gdi-course-stat"><span class="gdi-course-stat-num" style="color:${progressColor};">${progress}%</span><span class="gdi-course-stat-label">Concl.</span></div>`
          }
        </div>
        ${isManual?'':`<div class="gdi-progress-bar"><div class="gdi-progress-fill" style="width:${progress}%;background:${progressColor};"></div></div>`}
        <button class="gdi-btn-continue gdi-course-continue" ${isManual?'':'disabled'}>
          ${isManual?'<i class="bi bi-hourglass-split"></i> Meggy preparando materiais…':'<i class="bi bi-hourglass-split"></i> Verificando…'}
        </button>`;
      grid.appendChild(el);

      const contBtn=el.querySelector('.gdi-course-continue');
      function applyTarget(tg){
        if(isManual){
          // curso manual: clicar leva ao path no drive
          contBtn.disabled=false;
          contBtn.innerHTML=`<i class="bi bi-folder2-open"></i> Abrir pasta no Drive`;
          contBtn.onclick=(e)=>{e.stopPropagation();location.href=c.key;};
          return;
        }
        if(tg){
          contBtn.disabled=false;
          contBtn.innerHTML=`<i class="bi bi-play-fill"></i> Continuar: ${escHtml(realName(tg).slice(0,30))}`;
          contBtn.onclick=(e)=>{e.stopPropagation();location.href=tg+(tg.includes('?')?'&':'?')+'a=view';};
        }else{
          contBtn.disabled=true;
          contBtn.className='gdi-btn-continue gdi-btn-done';
          contBtn.innerHTML='<i class="bi bi-check2-all"></i> Tudo em dia!';
        }
      }
      // ★ PATCH C: se target foi pre-buscado, usa; senão faz fetch aqui (fallback)
      if(target!==undefined){
        applyTarget(target);
      }else if(isManual){
        applyTarget(null);
      }else{
        bestIn(c.key).then(applyTarget);
      }

      // botão remover
      const removeBtn=el.querySelector('.gdi-course-remove');
      if(removeBtn){
        removeBtn.onmouseenter=()=>{removeBtn.style.color='#ff8b8b';removeBtn.style.background='rgba(255,107,107,.15)';};
        removeBtn.onmouseleave=()=>{removeBtn.style.color='var(--ferreto-text-muted,#8b949e)';removeBtn.style.background='transparent';};
        removeBtn.onclick=async (e)=>{
          e.stopPropagation();
          const ok=await window.gdiModal({
            title:'Ocultar curso',
            message:'Ocultar "'+name+'" da sua lista de cursos?\n\nO curso não será excluído — você pode restaurá-lo depois.',
            confirmText:'Ocultar',
            cancelText:'Cancelar',
            danger:true
          });
          if(ok){
            hideCourse(c.key);
            showToast('Curso ocultado');
            renderCursos(box);
          }
        };
      }

      // clicar no card abre detalhes
      el.onclick=(e)=>{
        if(e.target.closest('button'))return;
        openCourseDetail(box,c);
      };
    }
    if(searchInput){
      let _searchTimer=null;
      searchInput.addEventListener('input',function(){
        if(_searchTimer)clearTimeout(_searchTimer);
        _searchTimer=setTimeout(()=>{
          box.__search=this.value;
          currentPage=0;
          box.__page=0;
          applyFilter();
        },250);
      });
    }
    applyFilter();
  }
  // ★ expõe renderCursos para outros módulos (gdiAddCourseFromDrive chama via window.renderCursos)
  window.renderCursos=renderCursos;
  window.gdiRefreshCentralPanel=function(){
    // ★ FIX (Task 14): pula 'addmateria' — é um trigger de modal, não um body real.
    //   Sem este guard, ao salvar um curso o gdiRefreshCentralPanel chamaria
    //   renderBody('addmateria') → showAddCourseModal(body) → reabriria o modal
    //   que acabamos de fechar.
    if(panel&&panel.style.display==='flex'&&tab&&tab!=='home'&&tab!=='addmateria'){
      // só re-renderiza o body da aba atual
      renderBody(tab);
    }
  };

  // ★ Modal para adicionar curso manualmente
  function showAddCourseModal(box){
    // ★ FIX local: garante esc() disponível mesmo se o escopo externo não tiver
    const esc=window.escHtml||(s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;'));
    const colors=['#ff8b9f','#5ddeda','#c026d3','#3fb950','#ffd43b','#7aa2ff','#ff6b6b','#a78bfa'];
    const icons=['⚖️','📐','📚','🎯','🧮','📖','🔬','💼','🌍','🏛️','⚙️','🎵'];
    const overlay=document.createElement('div');
    overlay.className='gdi-modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML=`<div style="background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#21262d);border-radius:14px;max-width:680px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);"><i class="bi bi-folder-plus"></i> Adicionar curso</b>
        <button id="gdi-amc-x" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:6px;">✕</button>
      </div>
      <!-- Tabs: Navegar Drive | Manual -->
      <div style="display:flex;gap:2px;padding:10px 20px 0;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <button id="tab-drive" class="gdi-amc-tab" style="flex:1;padding:8px;border:0;background:var(--ferreto-surface-3,rgba(255,255,255,.08));color:var(--ferreto-text,#f0f6fc);cursor:pointer;font-size:13px;border-radius:8px 8px 0 0;font-weight:600;border-bottom:2px solid var(--ferreto-primary,#ff8b9f);">📂 Navegar Drive</button>
        <button id="tab-manual" class="gdi-amc-tab" style="flex:1;padding:8px;border:0;background:transparent;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:13px;border-radius:8px 8px 0 0;">✏️ Manual</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:16px 20px;">
        <!-- Painel Drive -->
        <div id="panel-drive">
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0 0 10px;line-height:1.5;">Navegue pelas pastas do Drive e clique em <b style="color:var(--ferreto-primary,#ff8b9f);">"Selecionar esta pasta"</b> para adicionar como curso. A Meggy vai ler os PDFs e vídeos automaticamente em background.</p>
          <!-- Breadcrumb -->
          <div id="gdi-amc-bc" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:8px 10px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;margin-bottom:10px;font-size:12px;"></div>
          <!-- Loading -->
          <div id="gdi-amc-loading" style="display:none;padding:30px;text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:13px;"><div class="gdi-spinner" style="margin:0 auto 10px;"></div>Carregando pastas...</div>
          <!-- Lista de pastas -->
          <div id="gdi-amc-folders" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;padding:4px;"></div>
          <!-- Pasta atual info -->
          <div id="gdi-amc-current-info" style="display:none;margin-top:14px;padding:12px;background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(93,222,218,.04));border:1px solid var(--ferreto-border-strong,#30363d);border-radius:10px;"></div>
        </div>
        <!-- Painel Manual (oculto por padrão) -->
        <div id="panel-manual" style="display:none;flex-direction:column;gap:14px;">
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Nome do curso *</label>
            <input id="gdi-amc-name" placeholder="Ex: Direito Constitucional para Concurso" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Ícone</label>
            <div id="gdi-amc-icons" style="display:flex;gap:6px;flex-wrap:wrap;">
              ${icons.map((ic,i)=>`<button class="gdi-amc-icon-btn" data-icon="${ic}" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;padding:8px 10px;font-size:18px;cursor:pointer;">${ic}</button>`).join('')}
            </div>
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Cor</label>
            <div id="gdi-amc-colors" style="display:flex;gap:6px;flex-wrap:wrap;">
              ${colors.map((c,i)=>`<button class="gdi-amc-color-btn" data-color="${c}" style="background:${c};border:2px solid transparent;border-radius:50%;width:32px;height:32px;cursor:pointer;"></button>`).join('')}
            </div>
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Meta diária (minutos)</label>
            <input id="gdi-amc-goal" type="number" min="10" max="480" value="60" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Observações (opcional)</label>
            <textarea id="gdi-amc-notes" placeholder="Ex: Prova em dezembro, banca CESPE..." style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;min-height:60px;resize:vertical;"></textarea>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px;border-top:1px solid var(--ferreto-border,#21262d);padding-top:14px;">
        <button id="gdi-amc-cancel" class="gdi-mode-btn" style="font-size:13px;">Cancelar</button>
        <button id="gdi-amc-save" style="font-size:13px;padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-weight:600;background:var(--ferreto-grad);color:#fff;">📂 Selecionar esta pasta</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    // ── Estado do navegador ──
    let selectedIcon=icons[0];
    let selectedColor=colors[0];
    let currentMode='drive';  // 'drive' | 'manual'
    let currentPath='/';      // path atual do navegador
    let selectedPath=null;    // path selecionado pelo aluno
    let selectedName=null;

    // ── Tabs ──
    const tabDrive=overlay.querySelector('#tab-drive');
    const tabManual=overlay.querySelector('#tab-manual');
    const panelDrive=overlay.querySelector('#panel-drive');
    const panelManual=overlay.querySelector('#panel-manual');
    const saveBtn=overlay.querySelector('#gdi-amc-save');
    function setMode(m){
      currentMode=m;
      if(m==='drive'){
        tabDrive.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';
        tabDrive.style.color='var(--ferreto-text,#f0f6fc)';
        tabDrive.style.borderBottom='2px solid var(--ferreto-primary,#ff8b9f)';
        tabDrive.style.fontWeight='600';
        tabManual.style.background='transparent';
        tabManual.style.color='var(--ferreto-text-muted,#8b949e)';
        tabManual.style.borderBottom='0';
        tabManual.style.fontWeight='400';
        panelDrive.style.display='block';
        panelManual.style.display='none';
        saveBtn.textContent='📂 Selecionar esta pasta';
        if(selectedPath)saveBtn.textContent='✓ Adicionar "'+(selectedName||selectedPath).slice(0,30)+'"';
        else saveBtn.textContent='📂 Selecionar esta pasta';
      }else{
        tabManual.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';
        tabManual.style.color='var(--ferreto-text,#f0f6fc)';
        tabManual.style.borderBottom='2px solid var(--ferreto-primary,#ff8b9f)';
        tabManual.style.fontWeight='600';
        tabDrive.style.background='transparent';
        tabDrive.style.color='var(--ferreto-text-muted,#8b949e)';
        tabDrive.style.borderBottom='0';
        tabDrive.style.fontWeight='400';
        panelDrive.style.display='none';
        panelManual.style.display='flex';
        saveBtn.textContent='💾 Salvar curso manual';
      }
    }
    tabDrive.onclick=()=>setMode('drive');
    tabManual.onclick=()=>setMode('manual');
    setMode('drive');

    // ── Navegador de Drive ──
    const bcEl=overlay.querySelector('#gdi-amc-bc');
    const foldersEl=overlay.querySelector('#gdi-amc-folders');
    const loadingEl=overlay.querySelector('#gdi-amc-loading');
    const currentInfoEl=overlay.querySelector('#gdi-amc-current-info');

    function normPath(p){return p||'/';}
    function pathSegments(p){
      // /0:/Cursos/Direito/Constitucional → ['0:', 'Cursos', 'Direito', 'Constitucional']
      return normPath(p).split('/').filter(Boolean);
    }
    function getDriveName(seg){
      const m=seg.match(/^(\d+):$/);
      if(m&&window.drive_names)return window.drive_names[+m[1]]||seg;
      return seg;
    }
    function isFolder(file){
      return file && (file.mimeType==='application/vnd.google-apps.folder' || file.type==='folder' || (file.dir===true) || (file.mimeType&&file.mimeType.includes('folder')));
    }
    function getFolderPath(file){
      if(file.path)return file.path;
      if(file.parentPath&&file.name)return file.parentPath+'/'+encodeURIComponent(file.name);
      if(file.fullPath)return file.fullPath;
      return null;
    }
    function getFileName(file){return file.name||file.title||file.originalName||'pasta';}

    function renderBreadcrumb(){
      const segs=pathSegments(currentPath);
      let html=`<span class="gdi-amc-bc-item" data-p="/" style="cursor:pointer;color:var(--ferreto-secondary,#5ddeda);"><i class="bi bi-house"></i> Home</span>`;
      let acc='';
      for(const s of segs){
        acc+='/'+s;
        const display=decodeURIComponent(getDriveName(s));
        html+=`<span style="color:var(--ferreto-text-faint,#6b7488);">/</span><span class="gdi-amc-bc-item" data-p="${esc(acc)}" style="cursor:pointer;color:var(--ferreto-text,#e6edf3);">${esc(display)}</span>`;
      }
      bcEl.innerHTML=html;
      bcEl.querySelectorAll('.gdi-amc-bc-item').forEach(el=>{
        el.onclick=()=>navigate(el.dataset.p);
      });
    }

    // ★ FIX: Normaliza path para sempre ter / no final de drive (ex: /0: → /0:/)
    function normalizeNavPath(p){
      if(!p||p==='/')return '/';
      if(/^\/\d+:$/.test(p))return p+'/';
      return p;
    }
    async function navigate(path){
      currentPath=normalizeNavPath(normPath(path));
      renderBreadcrumb();
      loadingEl.style.display='block';
      foldersEl.innerHTML='';
      currentInfoEl.style.display='none';
      try{
        // ★ ESTRATÉGIA: chama gdiListAllFiles (faz POST no path com paginação)
        const pw=window.gdiGetPw?window.gdiGetPw():'';
        let allFiles=[];
        if(window.gdiListAllFiles){
          try{
            const result=await window.gdiListAllFiles(currentPath, pw);
            if(Array.isArray(result))allFiles=result;
          }catch(e){console.warn('[AddCourse] gdiListAllFiles falhou:',e.message);}
        }
        if(!allFiles.length && currentPath!=='/'){
          try{
            const ctrl=new AbortController();
            const to=setTimeout(()=>ctrl.abort(),15000);
            const r=await fetch(currentPath,{
              method:'POST',
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({password:pw||'',page_token:'',page_index:0}),
              signal:ctrl.signal
            });
            clearTimeout(to);
            if(r.ok){
              const d=await r.json();
              if(d&&d.data&&Array.isArray(d.data.files))allFiles=d.data.files;
            }else{
              console.warn('[AddCourse] fetch direto HTTP',r.status);
            }
          }catch(e){console.warn('[AddCourse] fetch direto falhou:',e.message);}
        }
        // Filtra só folders + arquivos relevantes
        const seen=new Set();
        const folders=[];
        const pdfs=[];
        const videos=[];
        for(const f of allFiles){
          if(!f)continue;
          if(isFolder(f)){
            const fn=getFileName(f);
            const fp=getFolderPath(f);
            const k=fp+'|'+fn;
            if(seen.has(k))continue;
            seen.add(k);
            folders.push(f);
          }else if(f.mimeType&&(f.mimeType.includes('pdf')||f.mimeType.includes('video'))){
            if(f.mimeType.includes('pdf'))pdfs.push(f);
            if(f.mimeType.includes('video'))videos.push(f);
          }
        }
        loadingEl.style.display='none';
        if(!folders.length && !pdfs.length && !videos.length){
          foldersEl.innerHTML='<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:13px;"><i class="bi bi-folder2-open" style="font-size:32px;display:block;margin-bottom:8px;color:var(--ferreto-text-faint,#6b7488);"></i>Nenhum arquivo encontrado aqui.<br><span style="font-size:11px;color:var(--ferreto-text-faint,#6b7488);">Verifique se o caminho existe ou se você está logado.</span></div>';
        }else if(!folders.length){
          foldersEl.innerHTML='<div style="grid-column:1/-1;padding:30px;text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:13px;"><i class="bi bi-folder2-open" style="font-size:32px;display:block;margin-bottom:8px;color:var(--ferreto-text-faint,#6b7488);"></i>Nenhuma subpasta aqui.<br>Esta é uma pasta folha — você pode selecioná-la como curso abaixo.</div>';
          const filesInfo=document.createElement('div');
          filesInfo.style.cssText='grid-column:1/-1;display:flex;flex-direction:column;gap:4px;padding:8px;';
          pdfs.slice(0,10).forEach(p=>{
            const row=document.createElement('div');
            row.style.cssText='font-size:11px;color:var(--ferreto-text-muted,#8b949e);padding:4px 8px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border-radius:6px;';
            row.innerHTML='<i class="bi bi-file-earmark-pdf" style="color:#ff6b6b;"></i> '+esc(getFileName(p));
            filesInfo.appendChild(row);
          });
          videos.slice(0,10).forEach(v=>{
            const row=document.createElement('div');
            row.style.cssText='font-size:11px;color:var(--ferreto-text-muted,#8b949e);padding:4px 8px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border-radius:6px;';
            row.innerHTML='<i class="bi bi-camera-video" style="color:#5ddeda;"></i> '+esc(getFileName(v));
            filesInfo.appendChild(row);
          });
          foldersEl.appendChild(filesInfo);
        }else{
          foldersEl.innerHTML=folders.slice(0,200).map(f=>{
            const fp=getFolderPath(f);
            const fn=getFileName(f);
            let target;
            if(fp){
              target=fp;
            }else{
              const base=currentPath.endsWith('/')?currentPath:currentPath+'/';
              target=base+encodeURIComponent(fn);
            }
            if(!target.endsWith('/'))target=target+'/';
            return `<div class="gdi-amc-folder-card" data-p="${esc(target)}" data-n="${esc(fn)}" style="padding:12px 14px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;cursor:pointer;transition:all .15s;">
              <div style="display:flex;align-items:center;gap:8px;">
                <i class="bi bi-folder-fill" style="color:var(--ferreto-secondary,#5ddeda);font-size:18px;flex:none;"></i>
                <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;line-height:1.3;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(fn)}</b>
                <i class="bi bi-chevron-right" style="color:var(--ferreto-text-faint,#6b7488);font-size:12px;flex:none;"></i>
              </div>
            </div>`;
          }).join('');
          foldersEl.querySelectorAll('.gdi-amc-folder-card').forEach(card=>{
            card.onmouseenter=()=>{card.style.borderColor='var(--ferreto-primary,#ff8b9f)';card.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';};
            card.onmouseleave=()=>{card.style.borderColor='var(--ferreto-border,#30363d)';card.style.background='var(--ferreto-surface-2,rgba(255,255,255,.04))';};
            card.onclick=()=>navigate(card.dataset.p);
          });
        }
        // mostra info da pasta atual
        const totalPdfs=pdfs.length;
        const totalVideos=videos.length;
        if(currentPath!=='/'){
          const segs=pathSegments(currentPath);
          const courseName=decodeURIComponent(getDriveName(segs[segs.length-1]));
          selectedPath=currentPath;
          selectedName=courseName;
          currentInfoEl.style.display='block';
          // ★ PATCH G: captura de clique no botão "Selecionar esta pasta"
          // agora é feita pelo listener anexado ao overlay (não mais no document).
          // O botão tem onclick inline que chama window.gdiAddCourseFromButton(this)
          // como fallback caso o listener no overlay não dispare.
          currentInfoEl.innerHTML=`<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
            <div style="font-size:30px;flex:none;">📁</div>
            <div style="flex:1;min-width:200px;">
              <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;">${esc(courseName)}</b>
              <div style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-top:4px;">${totalPdfs} PDF(s) · ${totalVideos} vídeo(s) nesta pasta</div>
              <div style="color:var(--ferreto-text-faint,#6b7488);font-size:11px;margin-top:2px;font-family:'JetBrains Mono',monospace;word-break:break-all;">${esc(currentPath)}</div>
            </div>
            <button id="gdi-amc-select-current" type="button" data-path="${esc(currentPath)}" data-name="${esc(courseName)}" data-pdfs="${totalPdfs}" style="padding:10px 18px;border-radius:8px;border:0;cursor:pointer;font-weight:600;background:var(--ferreto-grad);color:#fff;font-size:13px;flex:none;pointer-events:auto;">✓ Selecionar esta pasta</button>
          </div>`;
          saveBtn.textContent='✓ Adicionar "'+courseName.slice(0,30)+'"';
        }else{
          selectedPath=null;
          selectedName=null;
          currentInfoEl.style.display='none';
          saveBtn.textContent='📂 Selecione uma pasta primeiro';
        }
      }catch(e){
        console.error('[AddCourse] erro ao navegar:',e);
        loadingEl.style.display='none';
        foldersEl.innerHTML='<div style="grid-column:1/-1;padding:20px;text-align:center;color:#ff8b8b;font-size:13px;">Erro: '+esc(e.message)+'</div>';
      }
    }

    // ── Adiciona curso a partir de pasta selecionada no Drive ──
    async function doAddCourseFromDrive(coursePath, courseName, pdfCount){
      // ★ FIX 1 (Task 23): decode URL-encoded courseName defensively (same reason as gdiAddCourseFromDrive).
      try{if(courseName&&String(courseName).indexOf('%')>=0)courseName=decodeURIComponent(courseName);}catch(_){}
      try{
        const LS_MANUAL='gdi-manual-courses-v1';
        const manual=lsGet(LS_MANUAL,[]);
        // evita duplicar
        if(manual.some(c=>c.path===coursePath)){
          showToast('Curso "'+courseName+'" já está adicionado');
          return;
        }
        const courseId='mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
        manual.push({
          id:courseId,name:courseName,icon:'📁',color:'#5ddeda',
          goal:60,notes:'',createdAt:Date.now(),
          manual:true,path:coursePath,courseKey:coursePath
        });
        lsSet(LS_MANUAL,manual);
        // ★ FIX: salva também no Drive via /api/courses/add (para persistir entre sessões/logouts)
        try{
          const r=await fetch('/api/courses/add',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({coursePath,courseName,pdfCount:pdfCount||0,addedAt:Date.now()})
          });
          if(r.ok){
            await r.json().catch(()=>({}));
          }else{
            console.warn('[AddCourse] /api/courses/add HTTP',r.status,'— continuando mesmo assim');
          }
        }catch(e){
          console.warn('[AddCourse] falha ao salvar no Drive (continuando):',e.message);
        }
        if(window.showToast)showToast('Curso "'+courseName+'" adicionado! 🐩 Batalhão de IA iniciando em background...');
        try{
          renderCursos(box);
        }catch(e){
          console.warn('[AddCourse] erro ao re-renderizar:',e.message);
        }
        if(overlay&&overlay.parentNode){
          overlay.remove();
        }
        // ★ BATALHÃO: dispara processamento em background (depois que modal já fechou)
        try{
          if(window.gdiIsaPdf && window.gdiIsaPdf.startBattalion){
            window.gdiIsaPdf.startBattalion(coursePath, coursePath, courseName, []).catch(e=>{
              console.warn('[Batalhão] falha assíncrona (não bloqueante):',e.message);
            });
          }else{
            console.warn('[AddCourse] gdiIsaPdf.startBattalion não disponível — batalhão não disparado');
          }
        }catch(e){console.warn('[Batalhão] falha:',e.message);}
      }catch(e){
        console.error('[AddCourse] erro fatal em doAddCourseFromDrive:',e);
        if(window.showToast)showToast('Erro ao adicionar curso: '+e.message);
        throw e;
      }
    }

    // ── Painel Manual (ícones + cores) ──
    overlay.querySelectorAll('.gdi-amc-icon-btn').forEach(b=>{
      b.onclick=()=>{
        overlay.querySelectorAll('.gdi-amc-icon-btn').forEach(x=>x.style.borderColor='var(--ferreto-border,#30363d)');
        b.style.borderColor='var(--ferreto-primary,#ff8b9f)';
        selectedIcon=b.dataset.icon;
      };
    });
    overlay.querySelectorAll('.gdi-amc-color-btn').forEach(b=>{
      b.onclick=()=>{
        overlay.querySelectorAll('.gdi-amc-color-btn').forEach(x=>x.style.borderWidth='2px');
        b.style.borderWidth='4px';
        selectedColor=b.dataset.color;
      };
    });
    const firstIcon=overlay.querySelector('.gdi-amc-icon-btn');
    if(firstIcon)firstIcon.style.borderColor='var(--ferreto-primary,#ff8b9f)';
    const firstColor=overlay.querySelector('.gdi-amc-color-btn');
    if(firstColor)firstColor.style.borderWidth='4px';

    // ── Close handlers ──
    const close=()=>{if(overlay&&overlay.parentNode)overlay.remove();};
    overlay.querySelector('#gdi-amc-x').onclick=close;
    overlay.querySelector('#gdi-amc-cancel').onclick=close;
    overlay.onclick=(e)=>{if(e.target===overlay)close();};

    // ★ PATCH G: listener de clique no botão "Selecionar esta pasta" anexado ao OVERLAY
    // (não mais ao document com capture:true). Quando o overlay é removido (close),
    // o listener vai junto — sem resíduo global. Use capture:true para pegar antes
    // do overlay.onclick (que fecha o modal em cliques fora do conteúdo).
    const selectCurrentHandler=async(e)=>{
      const btn=e.target.closest&&e.target.closest('#gdi-amc-select-current');
      if(!btn)return;  // não foi clique no botão → ignora
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if(window.gdiAddCourseFromButton)window.gdiAddCourseFromButton(btn);
    };
    overlay.addEventListener('click',selectCurrentHandler,true);

    // ── Save handler (decide modo) ──
    saveBtn.onclick=async (e)=>{
      if(e){e.preventDefault();e.stopPropagation();}
      try{
        if(currentMode==='drive'){
          if(!selectedPath||!selectedName){
            console.warn('[AddCourse] nenhum path selecionado');
            showToast('Navegue até uma pasta e clique em "Selecionar esta pasta"');
            return;
          }
          await doAddCourseFromDrive(selectedPath, selectedName, 0);
        }else{
          // modo manual
          const name=overlay.querySelector('#gdi-amc-name').value.trim();
          if(!name){showToast('Digite o nome do curso');return;}
          const goal=parseInt(overlay.querySelector('#gdi-amc-goal').value)||60;
          const notes=overlay.querySelector('#gdi-amc-notes').value.trim();
          const LS_MANUAL='gdi-manual-courses-v1';
          const manual=lsGet(LS_MANUAL,[]);
          const courseId='mc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
          const coursePath='/0:/'+encodeURIComponent(name);
          manual.push({
            id:courseId,name,icon:selectedIcon,color:selectedColor,
            goal,notes,createdAt:Date.now(),
            manual:true,path:coursePath,courseKey:coursePath
          });
          lsSet(LS_MANUAL,manual);
          if(overlay&&overlay.parentNode)overlay.remove();
          showToast('Curso "'+name+'" adicionado! 🐩 Batalhão de IA iniciando em background...');
          try{renderCursos(box);}catch(_){}
          // ★ BATALHÃO para manual
          try{
            const pdfs=[];
            if(window.gdiListAllFiles){
              try{
                const files=await window.gdiListAllFiles(coursePath,'');
                if(Array.isArray(files)){
                  for(const f of files){
                    if(f && f.mimeType && (f.mimeType.includes('pdf')||f.name&&f.name.toLowerCase().endsWith('.pdf'))){
                      pdfs.push({name:f.name, url:f.path||f.url, text:''});
                    }
                  }
                }
              }catch(_){}
            }
            if(window.gdiIsaPdf && window.gdiIsaPdf.startBattalion){
              if(pdfs.length && window.gdiIsaPdf.extractPdfText){
                const PARALLEL=5;
                for(let i=0;i<pdfs.length;i+=PARALLEL){
                  const chunk=pdfs.slice(i,i+PARALLEL);
                  await Promise.allSettled(chunk.map(async p=>{
                    try{
                      if(p.url){
                        const txt=await window.gdiIsaPdf.extractPdfText(p.url);
                        p.text=txt.slice(0,15000);
                      }
                    }catch(_){}
                  }));
                }
              }
              await window.gdiIsaPdf.startBattalion(coursePath, coursePath, name, pdfs);
            }
          }catch(e){console.warn('[Batalhão] falha:',e.message);}
        }
      }catch(e){
        console.error('[AddCourse] erro fatal no save handler:',e);
        if(window.showToast)showToast('Erro: '+e.message);
      }
    };

    // ── Inicia navegação na raiz ──
    setTimeout(()=>{
      if(window.drive_names && window.drive_names.length){
        bcEl.innerHTML=`<span class="gdi-amc-bc-item" data-p="/" style="cursor:pointer;color:var(--ferreto-secondary,#5ddeda);"><i class="bi bi-house"></i> Home</span>`;
        foldersEl.innerHTML='';
        loadingEl.style.display='none';
        window.drive_names.forEach((dn,i)=>{
          const card=document.createElement('div');
          card.className='gdi-amc-folder-card';
          card.dataset.p='/'+i+':';
          card.dataset.n=dn;
          card.style.cssText='padding:12px 14px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;cursor:pointer;transition:all .15s;';
          card.innerHTML=`<div style="display:flex;align-items:center;gap:8px;"><i class="bi bi-hdd-stack-fill" style="color:var(--ferreto-primary,#ff8b9f);font-size:18px;flex:none;"></i><b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;">${esc(dn)}</b><i class="bi bi-chevron-right" style="color:var(--ferreto-text-faint,#6b7488);font-size:12px;flex:none;margin-left:auto;"></i></div>`;
          card.onmouseenter=()=>{card.style.borderColor='var(--ferreto-primary,#ff8b9f)';card.style.background='var(--ferreto-surface-3,rgba(255,255,255,.08))';};
          card.onmouseleave=()=>{card.style.borderColor='var(--ferreto-border,#30363d)';card.style.background='var(--ferreto-surface-2,rgba(255,255,255,.04))';};
          card.onclick=()=>navigate('/'+i+':/');
          foldersEl.appendChild(card);
        });
        currentInfoEl.style.display='none';
      }else{
        navigate('/0:/');
      }
    },50);
  }

  // ★ Modal de cursos ocultos
  function showHiddenCoursesModal(box){
    const hidden=listHiddenCourses();
    if(!hidden.length){showToast('Nenhum curso oculto');return;}
    const items=hidden.map(ck=>({
      key:ck,
      name:cleanCourseName(ck),
      drive:driveNameOf(ck)
    }));
    box.innerHTML=`<div style="max-width:680px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;"><i class="bi bi-eye-slash"></i> Cursos ocultos (${hidden.length})</b>
        <button id="gdi-hidden-back" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-arrow-left"></i> Voltar</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${items.map(it=>`
          <div class="gdi-note" style="display:flex;align-items:center;gap:10px;">
            <i class="bi bi-folder-x" style="color:var(--ferreto-text-muted,#8b949e);font-size:16px;flex:none;"></i>
            <div style="flex:1;min-width:0;">
              <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(it.name)}</b>
              ${it.drive?`<small style="color:var(--ferreto-secondary,#5ddeda);font-size:10px;">${escHtml(it.drive)}</small>`:''}
            </div>
            <button class="gdi-mode-btn gdi-restore-one" data-ck="${escHtml(it.key)}" style="font-size:11px;"><i class="bi bi-arrow-counterclockwise"></i> Restaurar</button>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:14px;padding-top:10px;border-top:1px solid var(--ferreto-border,#21262d);display:flex;gap:8px;justify-content:flex-end;">
        <button id="gdi-restore-all" class="gdi-btn gdi-btn-primary" style="font-size:12px;"><i class="bi bi-arrow-counterclockwise"></i> Restaurar todos</button>
      </div>
    </div>`;
    box.querySelector('#gdi-hidden-back').onclick=()=>renderCursos(box);
    box.querySelectorAll('.gdi-restore-one').forEach(b=>{
      b.onclick=()=>{
        unhideCourse(b.dataset.ck);
        showToast('Curso restaurado');
        showHiddenCoursesModal(box);
      };
    });
    box.querySelector('#gdi-restore-all').onclick=async ()=>{
      const ok=await window.gdiModal({
        title:'Restaurar todos',
        message:'Restaurar todos os '+hidden.length+' cursos?',
        confirmText:'Restaurar todos',
        cancelText:'Cancelar'
      });
      if(ok){
        lsSet(LS_HIDDEN,[]);
        showToast('Todos os cursos restaurados');
        renderCursos(box);
      }
    };
  }

  // ★ Painel de detalhes do curso (abre ao clicar no card)
  function openCourseDetail(box,c){
    const name=cleanCourseName(c.key);
    const drive=driveNameOf(c.key);
    // ★ FIX 3b (Task 14): usa totalLessons real (do manual course) ao invés de c.lessons.size
    // (que era o nº de paths visitados — wrong).
    const total=c.totalLessons||c.lessons.size||0;
    const watched=c.watched||0;
    const remaining=Math.max(0,total-watched);  // ★ nunca negativo
    const progress=total>0?Math.min(100,Math.round(watched/total*100)):(watched>0?100:0);
    const progressColor=progress>=80?'#3fb950':progress>=40?'#ffd43b':'var(--ferreto-primary,#ff8b9f)';
    const coursePath=c.key;  // e.g. /4:/CANTE COM EXCELENCIA 2.0 + COMUNIDADE/

    // coleta aulas individuais do curso
    const d=stateD()||{};
    const pre=low(c.key);
    const inC=p=>{const l=low(p);return l===pre||l.indexOf(pre+'/')===0;};
    const lessons=[];
    const w=(d&&d.watched)||{},r=(d&&d.resume)||{};
    const seen=new Set();
    const addLesson=(p,watched,resume)=>{
      const lp=low(p);
      if(seen.has(lp))return;
      if(!inC(p))return;
      seen.add(lp);
      lessons.push({path:String(p).split('?')[0],name:realName(p),watched,resumed:!!resume});
    };
    for(const k in w)addLesson(k,true,r[k]);
    for(const k in r)if(!seen.has(low(k)))addLesson(k,false,r[k]);
    (Array.isArray(d.history)?d.history:[]).forEach(h=>{if(h&&h.path)addLesson(h.path,false,null);});

    // ★ Task 15: merge com aulas escaneadas (scanner background).
    //    Se o scanner já encontrou aulas (via gdiListAllFiles recursivo),
    //    adicionamos as que ainda não estão na lista (não assistidas).
    //    Cada aula escaneada recebe watched=true se seu path estiver em d.watched.
    let scannedCount = 0;
    let scanStatus = null;
    if(window.gdiCourseScanner){
      try{
        const sp = window.gdiCourseScanner.getScanProgress(c.key);
        if(sp){
          scanStatus = sp.status;
          scannedCount = sp.lessonsFound || 0;
        }
        const scanned = window.gdiCourseScanner.getCourseLessons(c.key);
        if(scanned && Array.isArray(scanned.lessons) && scanned.lessons.length){
          for(let i=0; i<scanned.lessons.length; i++){
            const sl = scanned.lessons[i];
            if(!sl || !sl.path) continue;
            const lp = low(sl.path);
            if(seen.has(lp)) continue;  // já está na lista (assistida)
            seen.add(lp);
            // Verifica se foi assistida por match exato de path no userstate.watched
            const isWatched = !!(w && w[sl.path]);
            lessons.push({
              path: sl.path,
              name: sl.name || realName(sl.path),
              watched: isWatched,
              resumed: false
            });
          }
        }
      }catch(_){}
    }
    lessons.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true}));

    box.innerHTML=`<div style="max-width:760px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--ferreto-border,#21262d);">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <button id="gdi-detail-back" class="gdi-mode-btn" style="font-size:12px;flex:none;"><i class="bi bi-arrow-left"></i></button>
          <i class="bi bi-folder-fill" style="color:var(--ferreto-primary,#ff8b9f);font-size:22px;flex:none;"></i>
          <div style="min-width:0;">
            <b style="color:var(--ferreto-text,#f0f6fc);font-size:16px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(name)}</b>
            ${drive?`<small style="color:var(--ferreto-secondary,#5ddeda);font-size:11px;"><i class="bi bi-hdd"></i> ${escHtml(drive)}</small>`:''}
          </div>
        </div>
        <button id="gdi-detail-hide" class="gdi-mode-btn" style="font-size:11px;color:#ff8b8b;border-color:rgba(255,107,107,.3);" title="Ocultar curso"><i class="bi bi-eye-slash"></i> Ocultar</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:18px;">
        <div style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:var(--ferreto-text,#f0f6fc);">${total}</div>
          <div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">Aulas</div>
        </div>
        <div style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#3fb950;">${watched}</div>
          <div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">Assistidas</div>
        </div>
        <div style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#ffd43b;">${remaining}</div>
          <div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">Restantes</div>
        </div>
        <div style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:${progressColor};">${progress}%</div>
          <div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;">Concluído</div>
        </div>
      </div>

      <div style="margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;">Progresso do curso</b>
          <span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${watched}/${total}</span>
        </div>
        <div style="height:8px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:4px;overflow:hidden;">
          <div style="height:8px;width:${progress}%;background:${progressColor};border-radius:4px;transition:width .3s;"></div>
        </div>
      </div>

      ${c.lastAt?`<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--ferreto-text-muted,#8b949e);">
        <i class="bi bi-clock-history"></i> Última atividade: <b style="color:var(--ferreto-text,#e6edf3);">${dateBr(c.lastAt)}</b>
      </div>`:''}

      ${(scanStatus==='scanning'||scanStatus==='error')?`
      <div style="background:var(--ferreto-surface-2,rgba(255,255,255,.03));border:1px solid var(--ferreto-border,#21262d);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--ferreto-text-muted,#8b949e);">
        ${scanStatus==='scanning'
          ? '<i class="bi bi-arrow-repeat" style="color:var(--ferreto-secondary,#5ddeda);"></i> Escaneando aulas em background... <b style="color:var(--ferreto-text,#e6edf3);">'+scannedCount+'</b> encontradas até agora (a lista abaixo cresce em tempo real).'
          : '<i class="bi bi-exclamation-triangle" style="color:#ff8b8b;"></i> O scanner encontrou um erro. Algumas aulas podem estar ausentes da lista.'}
      </div>`:''}

      <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="gdi-detail-continue" class="gdi-btn gdi-btn-primary" style="font-size:12px;flex:1;justify-content:center;" disabled><i class="bi bi-hourglass-split"></i> Verificando próxima aula…</button>
        <a href="${escHtml(coursePath)}" class="gdi-mode-btn" style="font-size:12px;flex:1;justify-content:center;text-decoration:none;display:inline-flex;align-items:center;gap:6px;" title="Abrir pasta no Drive"><i class="bi bi-folder2-open"></i> Ir para o Drive</a>
      </div>

      ${/* ★ Task 16 / FIX 2: botão "Escanear agora" na visão de detalhe */ ''}
      ${(!scanStatus || scanStatus === 'error') ? `
      <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="gdi-detail-scan" class="gdi-mode-btn" data-course-key="${escHtml(c.key)}" style="font-size:12px;flex:1;justify-content:center;color:var(--ferreto-secondary,#5ddeda);border-color:rgba(93,222,218,.3);" title="Escanear aulas do curso">
          <i class="bi bi-arrow-repeat"></i> Escanear agora
        </button>
      </div>` : ''}
      ${scanStatus === 'scanning' ? `
      <div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button id="gdi-detail-scan" class="gdi-mode-btn" disabled style="font-size:12px;flex:1;justify-content:center;opacity:.7;cursor:default;">
          <i class="bi bi-hourglass-split"></i> Escaneando ${scannedCount} aulas… (${(function(){const sp=window.gdiCourseScanner&&window.gdiCourseScanner.getScanProgress(c.key);return sp?sp.percent:0})()}%)
        </button>
      </div>` : ''}

      <div>
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:13px;display:block;margin-bottom:8px;"><i class="bi bi-collection"></i> Disciplinas do curso</b>
        ${(function(){
          // ★ Task 18: agrupa aulas por disciplina (pasta pai da aula)
          // Em vez de listar 265 "001 - aula.mp4", mostra:
          //   Direito Administrativo — 45 aulas · 12 assistidas · 33 restantes
          //   Direito Constitucional — 38 aulas · 5 assistidas · 33 restantes
          // etc.
          if(!lessons.length && !total){
            return '<div class="gdi-notes-empty"><i class="bi bi-info-circle" style="font-size:18px;color:var(--ferreto-text-muted,#8b949e);vertical-align:middle;"></i> <span style="vertical-align:middle;">Nenhuma aula encontrada ainda.</span><div style="margin-top:8px;font-size:12px;"><a href="'+escHtml(coursePath)+'" style="color:var(--ferreto-secondary,#5ddeda);text-decoration:underline;"><i class="bi bi-folder2-open"></i> Abrir pasta no Drive</a></div></div>';
          }
          // Agrupa por disciplina: a pasta imediatamente dentro do curso
          // path típico: /9:/Curso/TRT/Direito Administrativo/Bloco I/001 - aula.mp4
          // disciplina = "Direito Administrativo" (primeiro segmento após coursePath)
          const groups = {};
          for(const l of lessons){
            // extrai disciplina do path (relativo ao coursePath)
            let rel = l.path;
            try{ rel = decodeURIComponent(l.path); }catch(_){ rel = l.path; }
            // remove coursePath do início
            let cp = coursePath;
            try{ cp = decodeURIComponent(coursePath); }catch(_){ cp = coursePath; }
            if(rel.indexOf(cp) === 0) rel = rel.slice(cp.length);
            const segs = rel.split('/').filter(Boolean);
            // disciplina = primeiro segmento após o curso (ou "Aulas" se estiver na raiz)
            const disc = segs.length > 1 ? segs[0] : (segs.length === 1 ? 'Aulas' : 'Outros');
            if(!groups[disc]) groups[disc] = { total: 0, watched: 0, path: cp + (cp.endsWith('/')?'':'/') + encodeURIComponent(disc) + '/' };
            groups[disc].total++;
            if(l.watched) groups[disc].watched++;
          }
          const arr = Object.keys(groups).sort((a,b) => a.localeCompare(b,'pt-BR'));
          if(!arr.length){
            return '<div class="gdi-notes-empty"><i class="bi bi-hourglass-split" style="color:var(--ferreto-secondary,#5ddeda);"></i> <span>Escaneando disciplinas...</span></div>';
          }
          return '<div style="display:flex;flex-direction:column;gap:8px;">' + arr.map(disc => {
            const g = groups[disc];
            const remaining = Math.max(0, g.total - g.watched);
            const pct = g.total > 0 ? Math.round(g.watched / g.total * 100) : 0;
            const color = pct >= 80 ? '#3fb950' : pct >= 40 ? '#ffd43b' : 'var(--ferreto-primary,#ff8b9f)';
            return '<div class="gdi-note" style="display:flex;align-items:center;gap:12px;cursor:pointer;padding:10px 12px;" data-disc-path="'+escHtml(g.path)+'">'
              + '<i class="bi bi-folder-fill" style="color:var(--ferreto-secondary,#5ddeda);font-size:18px;flex:none;"></i>'
              + '<div style="flex:1;min-width:0;">'
              + '<div style="color:var(--ferreto-text,#e6edf3);font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+escHtml(disc)+'</div>'
              + '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-top:2px;">'
              + '<span style="color:#3fb950;">'+g.watched+' assistidas</span> · '
              + '<span>'+g.total+' aulas</span> · '
              + '<span style="color:#ffd43b;">'+remaining+' restantes</span>'
              + '</div>'
              + '</div>'
              + '<div style="flex:none;text-align:right;">'
              + '<div style="font-size:16px;font-weight:700;color:'+color+';">'+pct+'%</div>'
              + '<div style="width:60px;height:4px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:2px;margin-top:3px;overflow:hidden;">'
              + '<div style="height:4px;width:'+pct+'%;background:'+color+';border-radius:2px;"></div>'
              + '</div>'
              + '</div>'
              + '</div>';
          }).join('') + '</div>';
        })()}
      </div>
    </div>`;

    box.querySelector('#gdi-detail-back').onclick=()=>renderCursos(box);
    box.querySelector('#gdi-detail-hide').onclick=async ()=>{
      const ok=await window.gdiModal({
        title:'Ocultar curso',
        message:'Ocultar "'+name+'" da sua lista de cursos?',
        confirmText:'Ocultar',
        cancelText:'Cancelar',
        danger:true
      });
      if(ok){
        hideCourse(c.key);
        showToast('Curso ocultado');
        renderCursos(box);
      }
    };
    const contBtn=box.querySelector('#gdi-detail-continue');
    bestIn(c.key).then(target=>{
      if(target){
        contBtn.disabled=false;
        contBtn.innerHTML=`<i class="bi bi-play-fill"></i> Continuar: ${escHtml(realName(target).slice(0,40))}`;
        contBtn.onclick=()=>{location.href=target+(target.includes('?')?'&':'?')+'a=view';};
      }else{
        contBtn.disabled=true;
        contBtn.className='gdi-mode-btn';
        contBtn.style.flex='1';contBtn.style.justifyContent='center';
        contBtn.innerHTML='<i class="bi bi-check2-all" style="color:#3fb950;"></i> Tudo em dia!';
      }
    });
    // ★ Task 18: click em disciplina → abre pasta no Drive (não aula individual)
    box.querySelectorAll('[data-disc-path]').forEach(el=>{
      el.onclick=()=>{
        const p=el.dataset.discPath;
        if(p)location.href=p;  // abre a pasta da disciplina
      };
    });

    // ★ Task 16 / FIX 2: botão "Escanear agora" — dispara scanner manualmente no detalhe
    const detailScanBtn = box.querySelector('#gdi-detail-scan');
    if(detailScanBtn && !detailScanBtn.disabled){
      detailScanBtn.addEventListener('click', function(e){
        e.stopPropagation();
        const ckScan = this.dataset.courseKey || c.key;
        if(ckScan && window.gdiCourseScanner){
          window.gdiCourseScanner.clearScanState(ckScan);
          // Feedback imediato
          try{
            this.disabled = true;
            this.style.opacity = '.7';
            this.innerHTML = '<i class="bi bi-hourglass-split"></i> Iniciando…';
          }catch(_){}
          window.gdiCourseScanner.startScan(ckScan, function(state, lessonsData){
            try{
              if(state.status === 'scanning'){
                const pct = (state.totalFolders > 0)
                  ? Math.round((state.scannedFolders||0)/state.totalFolders*100)
                  : 0;
                if(detailScanBtn && detailScanBtn.isConnected){
                  detailScanBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Escaneando '+pct+'%';
                }
              }else if(state.status === 'done' || state.status === 'error'){
                // Re-renderiza o detalhe com dados frescos do scanner
                try{
                  const fresh = (window.__gdiCollectCourses||function(){return []})();
                  const fc = fresh.find(x => x.key === c.key);
                  if(fc) openCourseDetail(box, fc);
                }catch(_){
                  // Fallback: re-render com o c original
                  try{ openCourseDetail(box, c); }catch(__){}
                }
              }
            }catch(_){}
          });
        }
      });
    }
  }

  async function renderStats(box){
    let d=stateD();
    if(!d){
      box.innerHTML=`<div class="gdi-notes-empty" style="padding:40px;text-align:center;">
        <div class="gdi-mat-isa-spin" style="margin:0 auto 12px;"></div>
        <div>Carregando estat\u00edsticas\u2026</div>
      </div>`;
      try{await ensureState();}catch(_){}
      d=stateD();
      if(!d){
        box.innerHTML=`<div class="gdi-notes-empty" style="padding:40px;text-align:center;">
          <i class="bi bi-exclamation-circle" style="font-size:32px;color:var(--ferreto-text-muted,#8b949e);"></i>
          <div style="margin-top:8px;">N\u00e3o foi poss\u00edvel carregar suas estat\u00edsticas.<br><span style="font-size:11px;">Estude algumas aulas e tente novamente.</span></div>
        </div>`;
        return;
      }
    }
    const chip=(ic,tx)=>`<span style="background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--ferreto-text,#e6edf3);">${ic} ${tx}</span>`;
    const acts={};
    const addA=t=>{if(!t)return;const k=dayKey(t);acts[k]=(acts[k]||0)+1;};
    const w=(d.watched)||{},r=(d.resume)||{};
    for(const k in w)addA(w[k]&&w[k].at);
    for(const k in r)addA(r[k]&&r[k].at);
    if(d.last&&d.last.at)addA(d.last.at);
    for(const k in(d.notes||{}))(d.notes[k]||[]).forEach(n=>addA(n.at));
    (Array.isArray(d.history)?d.history:[]).forEach(h=>addA(h&&h.at));
    const days=new Set(Object.keys(acts));
    let streak=0;const dd=new Date();
    const hasD=t=>days.has(dayKey(t));
    if(!hasD(dd))dd.setDate(dd.getDate()-1);
    while(hasD(dd)){streak++;dd.setDate(dd.getDate()-1);}
    const today=new Date();today.setHours(12,0,0,0);
    const begin=new Date(today);begin.setDate(begin.getDate()-91);begin.setDate(begin.getDate()-begin.getDay());
    const n=Math.round((today-begin)/86400000)+1;
    let heat='';
    for(let i=0;i<n;i++){
      const t=new Date(begin.getTime()+i*86400000);
      const a=acts[dayKey(t)]||0;
      const lvl=a===0?0:a===1?1:a<=3?2:a<=6?3:4;
      heat+=`<i class="${lvl?'l'+lvl:''}" title="${dateBr(t)} \u00b7 ${a} atividade${a===1?'':'s'}"></i>`;
    }
    const ws=new Date();ws.setHours(0,0,0,0);ws.setDate(ws.getDate()-ws.getDay());
    let wkMin=0;
    const watch=lsGet(LS_WATCH,{});
    for(const k in watch){const p=k.split('-').map(Number);const t=new Date(p[0],p[1]-1,p[2],12);if(t>=ws)wkMin+=watch[k];}
    wkMin=Math.round(wkMin/60);
    const per={};
    for(const k in r){const ck=courseKeyOf(k);if(!ck)continue;const x=r[k]||{};per[ck]=(per[ck]||0)+Math.min(x.t||0,(x.d>0?x.d:x.t)||0);}
    const top=Object.entries(per).map(([ck,s])=>({ck,h:s/3600})).sort((a,b)=>b.h-a.h).slice(0,8);
    const maxH=top.length?Math.max(top[0].h,.1):1;
    let notesN=0;for(const k in(d.notes||{}))notesN+=(d.notes[k]||[]).length;
    let srsDue=0;const now=Date.now();
    for(const k in(d.notes||{}))(d.notes[k]||[]).forEach(x=>{const e=d.srs&&d.srs[k+'|'+x.at];if((e?e.due:(x.at+86400000))<=now)srsDue++;});
    const totalH=Object.values(per).reduce((a,b)=>a+b,0)/3600;
    box.innerHTML=`
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        ${chip('\ud83d\udd25',streak+' dia'+(streak===1?'':'s')+' seguidos')}
        ${chip('\u23f1\ufe0f',fmtMin(todayMin())+' hoje')}
        ${chip('\ud83d\udcca',fmtMin(wkMin)+' na semana')}
        ${chip('\u2753','\u2248'+totalH.toFixed(1).replace('.',',')+'h no total')}
        ${chip('\u2705',Object.keys(w).length+' conclu\u00eddas')}
        ${chip('\u25b6',Object.keys(r).length+' em andamento')}
        ${chip('\ud83d\udcdd',notesN+' anota\u00e7\u00f5es')}
        ${srsDue?chip('\ud83c\udf93',srsDue+' revis\u00f5es vencidas'):''}
      </div>
      <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px;">\u00daltimos 3 meses \u00b7 atividades por dia</h4>
      <div class="heat" style="margin-bottom:18px;overflow-x:auto;padding-bottom:4px;">${heat}</div>
      <h4 style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px;">Horas por curso (estimativa)</h4>
      ${top.map(t2=>`<div style="margin-bottom:8px;min-width:260px;max-width:640px;">
        <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ferreto-text,#e6edf3);margin-bottom:3px;">
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:78%;">${escHtml(courseName(t2.ck))}</span>
          <span style="color:var(--ferreto-text-muted,#8b949e);">${t2.h.toFixed(1).replace('.',',')}h</span>
        </div>
        <div style="height:6px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:3px;overflow:hidden;"><div style="height:6px;width:${Math.max(3,Math.round(t2.h/maxH*100))}%;background:var(--ferreto-grad);"></div></div>
      </div>`).join('')||'<div class="gdi-notes-empty">Sem dados ainda.</div>'}`;
  }

  // ★ REMOVIDO: tab fc (Flashcards) — user request
  // ★ Função MANTIDA para preservar API pública (window.renderFlash e chamadas internas)
  function renderFlash(box){
    const cs=cards(),due=dueCards();
    const currentAula=(document.querySelector('.gdi-player-wrap')&&window.gdiVideoKey)?norm(window.gdiVideoKey()):'';
    const inp='background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,rgba(255,255,255,.14));border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:8px;font-size:13px;';
    box.innerHTML=`
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;">
        <b style="color:var(--ferreto-text,#f0f6fc);">${cs.length} cart\u00e3o${cs.length===1?'':'\u00f5es'}</b>
        <span style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">${due.length} vencido${due.length===1?'':'s'}</span>
        <button id="gdi-fc-study" class="gdi-btn gdi-btn-primary" style="font-size:12px;" ${due.length?'':'disabled'}><i class="bi bi-play-fill"></i> Revisar (${due.length})</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;max-width:640px;">
        <input id="gdi-fc-f" placeholder="Frente (pergunta)" style="${inp}">
        <input id="gdi-fc-b" placeholder="Verso (resposta)" style="${inp}">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <button id="gdi-fc-add" class="gdi-mode-btn" style="font-size:12px;"><i class="bi bi-plus-lg"></i> Adicionar</button>
          ${currentAula?`<span style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);">aula atual: ${escHtml(realName(currentAula).slice(0,30))}</span>`:''}
        </div>
      </div>
      <div id="gdi-fc-list" class="gdi-fc-grid-m22" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;"></div>`;
    const list=box.querySelector('#gdi-fc-list');
    function drawList(){
      const all=cards();
      if(!all.length){list.innerHTML='<div class="gdi-notes-empty" style="grid-column:1/-1;">Nenhum cart\u00e3o ainda \u2014 crie o primeiro acima, ou abra uma aula e clique em "Resumo Meggy" na barra de materiais para gerar flashcards automaticamente.</div>';return;}
      list.innerHTML='';
      all.slice().reverse().forEach(c=>{
        const card=document.createElement('div');
        card.className='gdi-fc-card';
        card.style.height='160px';
        card.innerHTML=`
          <div class="gdi-fc-card-inner">
            <div class="gdi-fc-card-face gdi-fc-card-front">
              <div class="gdi-fc-card-label"><i class="bi bi-question-circle"></i> PERGUNTA</div>
              <div class="gdi-fc-card-text">${escHtml(String(c.f).slice(0,200))}</div>
              <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para virar</div>
            </div>
            <div class="gdi-fc-card-face gdi-fc-card-back">
              <div class="gdi-fc-card-label"><i class="bi bi-check-circle"></i> RESPOSTA</div>
              <div class="gdi-fc-card-text">${escHtml(String(c.b).slice(0,300))}</div>
              <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para voltar</div>
            </div>
          </div>
          <button class="gdi-fc-card-del" title="Excluir"><i class="bi bi-x-lg"></i></button>`;
        card.onclick=(e)=>{if(e.target.closest('.gdi-fc-card-del'))return;card.classList.toggle('gdi-fc-flipped');};
        card.querySelector('.gdi-fc-card-del').onclick=(e)=>{e.stopPropagation();saveCards(cards().filter(x=>x.id!==c.id));drawList();showToast('Cartão excluído');};
        list.appendChild(card);
      });
    }
    drawList();
    box.querySelector('#gdi-fc-add').onclick=()=>{
      const f=box.querySelector('#gdi-fc-f').value.trim();
      const b=box.querySelector('#gdi-fc-b').value.trim();
      if(!f||!b){showToast('Preencha frente e verso');return;}
      const all=cards();
      all.push({id:Date.now()+'-'+Math.random().toString(36).slice(2,7),f,b,path:currentAula||'',lesson:currentAula?realName(currentAula):'',at:Date.now(),box:0,due:Date.now()+86400000});
      saveCards(all);
      box.querySelector('#gdi-fc-f').value='';box.querySelector('#gdi-fc-b').value='';
      drawList();showToast('Cart\u00e3o adicionado');
    };
    box.querySelector('#gdi-fc-study').onclick=()=>studyFlash(box);
  }
  // ★ expõe renderFlash para a API pública
  window.renderFlash=renderFlash;

  function studyFlash(box){
    const queue=dueCards();
    if(!queue.length){renderFlash(box);return;}
    let i=0,ok=0;
    function draw(){
      if(i>=queue.length){
        FC.active=false;
        box.innerHTML=`<div style="text-align:center;padding:30px;">
          <div style="font-size:40px;">\ud83c\udf89</div>
          <h3 style="color:var(--ferreto-text,#f0f6fc);">Revis\u00e3o conclu\u00edda!</h3>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:13px;">${ok}/${queue.length} lembradas de primeira.</p>
          <button class="gdi-mode-btn" id="gdi-fc-back" style="margin-top:8px;">Voltar aos cart\u00f5es</button>
        </div>`;
        box.querySelector('#gdi-fc-back').onclick=()=>renderFlash(box);
        return;
      }
      const c=queue[i];
      box.innerHTML=`
        <div style="text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-bottom:10px;">Cart\u00e3o ${i+1}/${queue.length} \u00b7 [espa\u00e7o] vira \u00b7 [1] esqueci \u00b7 [2] quase \u00b7 [3] lembrei</div>
        <div class="gdi-fc-card gdi-fc-card-large" id="gdi-fc-card" style="margin:0 auto 14px;">
          <div class="gdi-fc-card-inner">
            <div class="gdi-fc-card-face gdi-fc-card-front">
              <div class="gdi-fc-card-label"><i class="bi bi-question-circle"></i> PERGUNTA</div>
              <div class="gdi-fc-card-text">${escHtml(c.f)}</div>
              <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para virar</div>
            </div>
            <div class="gdi-fc-card-face gdi-fc-card-back">
              <div class="gdi-fc-card-label"><i class="bi bi-check-circle"></i> RESPOSTA</div>
              <div class="gdi-fc-card-text">${escHtml(c.b)}</div>
              <div class="gdi-fc-card-hint"><i class="bi bi-arrow-repeat"></i> clique para voltar</div>
            </div>
          </div>
        </div>
        <div id="gdi-fc-btns" style="display:none;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
          <button class="gdi-mode-btn" data-g="1">1 \u00b7 Esqueci</button>
          <button class="gdi-mode-btn" data-g="2">2 \u00b7 Quase</button>
          <button class="gdi-btn gdi-btn-primary" data-g="3">3 \u00b7 Lembrei</button>
        </div>`;
      const card=box.querySelector('#gdi-fc-card'),btns=box.querySelector('#gdi-fc-btns');
      let flipped=false;
      const flip=()=>{
        if(flipped)return;flipped=true;
        card.classList.add('gdi-fc-flipped');
        btns.style.display='flex';
      };
      card.onclick=flip;
      box.querySelectorAll('[data-g]').forEach(b=>b.onclick=()=>grade(+b.dataset.g));
      FC.flip=flip;
      FC.grade=grade;
      FC.active=true;
    }
    function grade(g){
      const c=queue[i];
      const all=cards();
      const ix=all.findIndex(x=>x.id===c.id);
      if(ix>=0){
        const result=window.gdiGradeCard(all[ix],g);
        all[ix].box=result.box;
        all[ix].due=result.due;
        all[ix].lastReview=result.lastReview;
        saveCards(all);
      }
      if(g===3||g===4)ok++;
      i++;draw();
    }
    draw();
  }

  // ★ REMOVIDO: tab mar (Maratona) — user request
  // ★ Função MANTIDA para preservar API pública
  function renderMarathon(box){
    const on=marOn(),intro=marIntro();
    const sw=(id,chk,tit,sub)=>`<label style="display:flex;justify-content:space-between;align-items:center;gap:14px;background:var(--ferreto-surface-2,#161b22);border:1px solid var(--ferreto-border,#21262d);border-radius:12px;padding:14px;cursor:pointer;">
      <span><b style="color:var(--ferreto-text,#f0f6fc);">${tit}</b><br><small style="color:var(--ferreto-text-muted,#8b949e);">${sub}</small></span>
      <input type="checkbox" id="${id}" ${chk?'checked':''} style="accent-color:var(--ferreto-primary,#ff8b9f);width:20px;height:20px;cursor:pointer;flex-shrink:0;"></label>`;
    box.innerHTML=`<div style="max-width:560px;display:flex;flex-direction:column;gap:12px;">
      ${sw('gdi-mar-on',on,'\ud83d\ude80 Modo Maratona','Ao terminar uma aula, abre sozinho a pr\u00f3xima n\u00e3o assistida da playlist')}
      ${sw('gdi-mar-intro',intro,'\u23e9 Pular introdu\u00e7\u00e3o autom\u00e1tico','Usa o tempo memorizado pelo bot\u00e3o "Pular introdu\u00e7\u00e3o" (M7)')}
      <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;">Vale nas p\u00e1ginas de aula com playlist. O check \u2713 da aula continua sendo dado pelo auto-assistido (90%).</p>
    </div>`;
    box.querySelector('#gdi-mar-on').addEventListener('change',e=>{
      lsSet(LS_MAR,e.target.checked);
      showToast('Modo Maratona '+(e.target.checked?'LIGADO \ud83d\ude80':'desligado'));
    });
    box.querySelector('#gdi-mar-intro').addEventListener('change',e=>lsSet(LS_MARINTRO,e.target.checked));
  }
  // ★ expõe renderMarathon para a API pública
  window.renderMarathon=renderMarathon;

  // ★ REMOVIDO: tab subjects (Matérias) — user request
  // ★ Função MANTIDA para preservar API pública
  function renderSubjects(box){
    if(!window.gdiSubjects){
      box.innerHTML='<div class="gdi-notes-empty">Sistema de matérias indisponível.</div>';
      return;
    }
    const subs=window.gdiSubjects.get();
    box.innerHTML=`<div style="max-width:760px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div>
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;">Matérias</b>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:4px 0 0;">Crie matérias para organizar seus flashcards. Ex: "Direito Constitucional", "Português", "Raciocínio Lógico".</p>
        </div>
        <button id="gdi-subj-add" class="gdi-btn gdi-btn-primary" style="font-size:12px;"><i class="bi bi-plus-lg"></i> Nova matéria</button>
      </div>
      <div id="gdi-subj-list" style="display:flex;flex-direction:column;gap:8px;"></div>
    </div>`;
    const list=box.querySelector('#gdi-subj-list');
    function drawList(){
      const all=window.gdiSubjects.get();
      if(!all.length){
        list.innerHTML='<div class="gdi-notes-empty" style="padding:40px;text-align:center;"><i class="bi bi-journal-text" style="font-size:36px;display:block;margin-bottom:10px;color:var(--ferreto-text-faint,#6b7488);"></i>Nenhuma matéria criada ainda.<br><span style="font-size:12px;">Clique em "Nova matéria" para começar.</span></div>';
        return;
      }
      const cardsArr=lsGet('gdi-cards-v1',[]);
      const countByName={};
      cardsArr.forEach(c=>{
        const s=c.subject||(c.path?c.path.split('/').filter(Boolean).pop():'')||'';
        if(s)countByName[s]=(countByName[s]||0)+1;
      });
      list.innerHTML='';
      all.forEach(s=>{
        const count=countByName[s.name]||0;
        const el=document.createElement('div');
        el.className='gdi-note';
        el.style.cssText='display:flex;align-items:center;gap:12px;padding:12px 14px;';
        el.innerHTML=`
          <span style="font-size:24px;flex:none;">${s.icon||'📚'}</span>
          <div style="flex:1;min-width:0;">
            <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;display:flex;align-items:center;gap:6px;">${escHtml(s.name)}<span style="width:8px;height:8px;border-radius:50%;background:${s.color||'#ff8b9f'};display:inline-block;"></span></b>
            ${s.notes?`<small style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;display:block;margin-top:2px;">${escHtml(s.notes)}</small>`:''}
            <small style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${count} card${count!==1?'s':''} · meta: ${s.goal||60} min/dia</small>
          </div>
          <button class="gdi-mode-btn gdi-subj-edit" data-id="${escHtml(s.id)}" style="font-size:11px;padding:5px 10px;"><i class="bi bi-pencil"></i></button>
          <button class="gdi-mode-btn gdi-subj-del" data-id="${escHtml(s.id)}" style="font-size:11px;padding:5px 10px;color:#ff8b8b;"><i class="bi bi-trash"></i></button>
        `;
        list.appendChild(el);
      });
      list.querySelectorAll('.gdi-subj-edit').forEach(b=>b.onclick=()=>editSubject(b.dataset.id,box));
      list.querySelectorAll('.gdi-subj-del').forEach(b=>b.onclick=async ()=>{
        const sub=all.find(x=>x.id===b.dataset.id);
        if(!sub)return;
        const ok=await window.gdiModal({
          title:'Excluir matéria',
          message:'Excluir "'+sub.name+'"? Os flashcards vinculados NÃO serão excluídos — apenas a matéria some da lista.',
          confirmText:'Excluir',
          cancelText:'Cancelar',
          danger:true
        });
        if(ok){
          window.gdiSubjects.delete(b.dataset.id);
          showToast('Matéria excluída');
          drawList();
        }
      });
    }
    drawList();
    box.querySelector('#gdi-subj-add').onclick=()=>editSubject(null,box,drawList);
  }
  function editSubject(id,box,afterSave){
    const colors=['#ff8b9f','#5ddeda','#c026d3','#3fb950','#ffd43b','#7aa2ff','#ff6b6b','#a78bfa'];
    const icons=['⚖️','📐','📚','🎯','🧮','📖','🔬','💼','🌍','🏛️','⚙️','🎵','📝','🎨','💻','🏥'];
    const existing=id?window.gdiSubjects.get().find(s=>s.id===id):null;
    const overlay=document.createElement('div');
    overlay.className='gdi-modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML=`<div style="background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#21262d);border-radius:14px;max-width:480px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--ferreto-border,#21262d);position:sticky;top:0;background:var(--ferreto-bg-2,#0d1119);z-index:1;">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);">${existing?'Editar matéria':'Nova matéria'}</b>
        <button id="gdi-subj-x" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:6px;">✕</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Nome *</label>
          <input id="gdi-subj-name" placeholder="Ex: Direito Constitucional" value="${existing?escHtml(existing.name):''}" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
        </div>
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Ícone</label>
          <div id="gdi-subj-icons" style="display:flex;gap:6px;flex-wrap:wrap;">${icons.map(ic=>`<button class="gdi-subj-ic" data-ic="${ic}" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid ${existing&&existing.icon===ic?'var(--ferreto-primary,#ff8b9f)':'var(--ferreto-border,#30363d)'};border-radius:8px;padding:8px 10px;font-size:18px;cursor:pointer;">${ic}</button>`).join('')}</div>
        </div>
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Cor</label>
          <div id="gdi-subj-colors" style="display:flex;gap:6px;flex-wrap:wrap;">${colors.map(c=>`<button class="gdi-subj-cl" data-cl="${c}" style="background:${c};border:${existing&&existing.color===c?'4px':'2px'} solid ${existing&&existing.color===c?'#fff':'transparent'};border-radius:50%;width:32px;height:32px;cursor:pointer;"></button>`).join('')}</div>
        </div>
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Meta diária (minutos)</label>
          <input id="gdi-subj-goal" type="number" min="10" max="480" value="${existing?(existing.goal||60):60}" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
        </div>
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Observações (opcional)</label>
          <textarea id="gdi-subj-notes" placeholder="Ex: Prova em dezembro, banca CESPE..." style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;min-height:60px;resize:vertical;">${existing?escHtml(existing.notes||''):''}</textarea>
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px;position:sticky;bottom:0;background:var(--ferreto-bg-2,#0d1119);">
        <button id="gdi-subj-cancel" class="gdi-mode-btn" style="font-size:13px;">Cancelar</button>
        <button id="gdi-subj-save" style="font-size:13px;padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-weight:600;background:var(--ferreto-grad);color:#fff;">${existing?'Salvar':'Criar matéria'}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    let selIcon=existing?existing.icon:icons[0];
    let selColor=existing?existing.color:colors[0];
    overlay.querySelectorAll('.gdi-subj-ic').forEach(b=>b.onclick=()=>{
      overlay.querySelectorAll('.gdi-subj-ic').forEach(x=>x.style.borderColor='var(--ferreto-border,#30363d)');
      b.style.borderColor='var(--ferreto-primary,#ff8b9f)';
      selIcon=b.dataset.ic;
    });
    overlay.querySelectorAll('.gdi-subj-cl').forEach(b=>b.onclick=()=>{
      overlay.querySelectorAll('.gdi-subj-cl').forEach(x=>{x.style.borderWidth='2px';x.style.borderColor='transparent';});
      b.style.borderWidth='4px';b.style.borderColor='#fff';
      selColor=b.dataset.cl;
    });
    const close=()=>overlay.remove();
    overlay.querySelector('#gdi-subj-x').onclick=close;
    overlay.querySelector('#gdi-subj-cancel').onclick=close;
    overlay.onclick=(e)=>{if(e.target===overlay)close();};
    overlay.querySelector('#gdi-subj-save').onclick=()=>{
      const name=overlay.querySelector('#gdi-subj-name').value.trim();
      if(!name){showToast('Digite o nome da matéria');return;}
      const goal=parseInt(overlay.querySelector('#gdi-subj-goal').value)||60;
      const notes=overlay.querySelector('#gdi-subj-notes').value.trim();
      window.gdiSubjects.save({
        id:existing?existing.id:('subj-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)),
        name,icon:selIcon,color:selColor,goal,notes,
        createdAt:existing?existing.createdAt:Date.now()
      });
      close();
      showToast(existing?'Matéria atualizada':'Matéria criada!');
      if(afterSave)afterSave();
    };
    setTimeout(()=>overlay.querySelector('#gdi-subj-name').focus(),50);
  }
  // ★ expõe renderSubjects para a API pública
  window.renderSubjects=renderSubjects;

  // ★ REMOVIDO: tab trails (Trilhas) — user request
  // ★ Função MANTIDA para preservar API pública
  function renderTrails(box){
    if(!window.gdiTrails){
      box.innerHTML='<div class="gdi-notes-empty">Sistema de trilhas indisponível.</div>';
      return;
    }
    const trails=window.gdiTrails.get();
    box.innerHTML=`<div style="max-width:760px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
        <div>
          <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;">Trilhas de Estudo</b>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:4px 0 0;">Agrupe cursos e matérias em uma meta. Ex: "Auditor Fiscal" = Direito Tributário + Contabilidade + Português.</p>
        </div>
        <button id="gdi-trail-add" class="gdi-btn gdi-btn-primary" style="font-size:12px;"><i class="bi bi-plus-lg"></i> Nova trilha</button>
      </div>
      <div id="gdi-trail-list" style="display:flex;flex-direction:column;gap:10px;"></div>
    </div>`;
    const list=box.querySelector('#gdi-trail-list');
    function drawList(){
      const all=window.gdiTrails.get();
      if(!all.length){
        list.innerHTML='<div class="gdi-notes-empty" style="padding:40px;text-align:center;"><i class="bi bi-signpost-2" style="font-size:36px;display:block;margin-bottom:10px;color:var(--ferreto-text-faint,#6b7488);"></i>Nenhuma trilha criada.<br><span style="font-size:12px;">Clique em "Nova trilha" para organizar seus cursos em uma meta.</span></div>';
        return;
      }
      list.innerHTML='';
      all.forEach(t=>{
        const total=t.courses?t.courses.length:0;
        const el=document.createElement('div');
        el.className='gdi-note';
        el.style.cssText='display:flex;align-items:center;gap:12px;padding:14px;cursor:pointer;';
        el.innerHTML=`
          <span style="font-size:28px;flex:none;">${t.icon||'🎯'}</span>
          <div style="flex:1;min-width:0;">
            <b style="color:var(--ferreto-text,#f0f6fc);font-size:14px;">${escHtml(t.name)}</b>
            ${t.description?`<small style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;display:block;margin-top:2px;">${escHtml(t.description)}</small>`:''}
            <small style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">${total} curso${total!==1?'s':''} · meta: ${t.goal||'—'} dias</small>
          </div>
          <button class="gdi-mode-btn gdi-trail-edit" data-id="${escHtml(t.id)}" style="font-size:11px;padding:5px 10px;"><i class="bi bi-pencil"></i></button>
          <button class="gdi-mode-btn gdi-trail-del" data-id="${escHtml(t.id)}" style="font-size:11px;padding:5px 10px;color:#ff8b8b;"><i class="bi bi-trash"></i></button>
        `;
        list.appendChild(el);
      });
      list.querySelectorAll('.gdi-trail-edit').forEach(b=>b.onclick=()=>editTrail(b.dataset.id,box,drawList));
      list.querySelectorAll('.gdi-trail-del').forEach(b=>b.onclick=async ()=>{
        const tr=window.gdiTrails.get().find(x=>x.id===b.dataset.id);
        if(!tr)return;
        const ok=await window.gdiModal({
          title:'Excluir trilha',
          message:'Excluir "'+tr.name+'"? Os cursos vinculados NÃO serão excluídos.',
          confirmText:'Excluir',
          cancelText:'Cancelar',
          danger:true
        });
        if(ok){
          window.gdiTrails.delete(b.dataset.id);
          showToast('Trilha excluída');
          drawList();
        }
      });
    }
    drawList();
    box.querySelector('#gdi-trail-add').onclick=()=>editTrail(null,box,drawList);
  }
  function editTrail(id,box,afterSave){
    const existing=id?window.gdiTrails.get().find(t=>t.id===id):null;
    const icons=['🎯','🏆','🚀','⭐','🎓','💼','🏛️','⚖️','📊','🔬','🌍','💡'];
    const overlay=document.createElement('div');
    overlay.className='gdi-modal-overlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.7);backdrop-filter:blur(4px);z-index:100002;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML=`<div style="background:var(--ferreto-bg-2,#0d1119);border:1px solid var(--ferreto-border,#21262d);border-radius:14px;max-width:520px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.6);">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--ferreto-border,#21262d);position:sticky;top:0;background:var(--ferreto-bg-2,#0d1119);z-index:1;">
        <b style="color:var(--ferreto-text,#f0f6fc);font-size:15px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);">${existing?'Editar trilha':'Nova trilha'}</b>
        <button id="gdi-trail-x" style="background:transparent;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:18px;padding:4px 8px;border-radius:6px;">✕</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:14px;">
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Nome *</label>
          <input id="gdi-trail-name" placeholder="Ex: Auditor Fiscal 2026" value="${existing?escHtml(existing.name):''}" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
        </div>
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Descrição (opcional)</label>
          <input id="gdi-trail-desc" placeholder="Ex: Concurso para Receita Federal" value="${existing?escHtml(existing.description||''):''}" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
        </div>
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em;">Ícone</label>
          <div id="gdi-trail-icons" style="display:flex;gap:6px;flex-wrap:wrap;">${icons.map(ic=>`<button class="gdi-trail-ic" data-ic="${ic}" style="background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid ${existing&&existing.icon===ic?'var(--ferreto-primary,#ff8b9f)':'var(--ferreto-border,#30363d)'};border-radius:8px;padding:8px 10px;font-size:18px;cursor:pointer;">${ic}</button>`).join('')}</div>
        </div>
        <div>
          <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;">Meta (dias para terminar)</label>
          <input id="gdi-trail-goal" type="number" min="1" max="3650" value="${existing?(existing.goal||90):90}" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;font-family:inherit;">
        </div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;padding:0 20px 16px;position:sticky;bottom:0;background:var(--ferreto-bg-2,#0d1119);">
        <button id="gdi-trail-cancel" class="gdi-mode-btn" style="font-size:13px;">Cancelar</button>
        <button id="gdi-trail-save" style="font-size:13px;padding:8px 16px;border-radius:8px;border:0;cursor:pointer;font-weight:600;background:var(--ferreto-grad);color:#fff;">${existing?'Salvar':'Criar trilha'}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    let selIcon=existing?existing.icon:icons[0];
    overlay.querySelectorAll('.gdi-trail-ic').forEach(b=>b.onclick=()=>{
      overlay.querySelectorAll('.gdi-trail-ic').forEach(x=>x.style.borderColor='var(--ferreto-border,#30363d)');
      b.style.borderColor='var(--ferreto-primary,#ff8b9f)';
      selIcon=b.dataset.ic;
    });
    const close=()=>overlay.remove();
    overlay.querySelector('#gdi-trail-x').onclick=close;
    overlay.querySelector('#gdi-trail-cancel').onclick=close;
    overlay.onclick=(e)=>{if(e.target===overlay)close();};
    overlay.querySelector('#gdi-trail-save').onclick=()=>{
      const name=overlay.querySelector('#gdi-trail-name').value.trim();
      if(!name){showToast('Digite o nome da trilha');return;}
      const desc=overlay.querySelector('#gdi-trail-desc').value.trim();
      const goal=parseInt(overlay.querySelector('#gdi-trail-goal').value)||90;
      window.gdiTrails.save({
        id:existing?existing.id:('trail-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)),
        name,description:desc,icon:selIcon,goal,
        courses:existing?existing.courses:[],
        createdAt:existing?existing.createdAt:Date.now()
      });
      close();
      showToast(existing?'Trilha atualizada':'Trilha criada!');
      if(afterSave)afterSave();
    };
    setTimeout(()=>overlay.querySelector('#gdi-trail-name').focus(),50);
  }
  // ★ expõe renderTrails para a API pública
  window.renderTrails=renderTrails;

  if(!document.getElementById('gdi-central-style')){
    const s=document.createElement('style');s.id='gdi-central-style';s.textContent=`
/* ═══ ÁREA DO ALUNO v3 — design moderno (sidebar + dashboard) ═══ */
#gdi-central{position:fixed;inset:0;z-index:10001;background:var(--ferreto-bg,#070910);color:var(--ferreto-text,#f3f5fa);font-family:var(--ferreto-font-body,'Rubik',sans-serif);display:none;overflow-y:auto;}
@keyframes gdi-central-in{from{opacity:0;transform:scale(.98)}to{opacity:1;transform:none}}
.gdi-central-box{width:100%;height:100%;min-height:100vh;margin:0;padding:0;background:var(--ferreto-bg,#070910);border:0;border-radius:0;}
.gdi-central-head{display:flex;align-items:center;gap:16px;padding:14px 20px;border-bottom:1px solid var(--ferreto-border,#21262d);background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(93,222,218,.05));flex-shrink:0;flex-wrap:nowrap;}
.gdi-central-head-title{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.gdi-central-head-title b{color:var(--ferreto-text,#f0f6fc);font-size:16px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-weight:600;}
.gdi-central-head-title .gdi-central-icon{font-size:22px;}
.gdi-central-stats{display:flex;gap:8px;flex:1;justify-content:center;flex-wrap:wrap;}
.gdi-central-stat{display:flex;align-items:center;gap:6px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);border-radius:999px;padding:5px 12px;font-size:12px;color:var(--ferreto-text,#e6edf3);}
.gdi-central-stat i{font-size:13px;}
.gdi-central-stat b{color:var(--ferreto-text,#f0f6fc);font-weight:600;}
.gdi-central-stat .gdi-stat-fire{color:#ff6b6b;}
.gdi-central-stat .gdi-stat-time{color:#ffd43b;}
.gdi-central-stat .gdi-stat-cards{color:var(--ferreto-primary,#ff8b9f);}
#gdi-central-x{margin-left:auto;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);color:var(--ferreto-text-muted,#8b949e);width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;}
#gdi-central-x:hover{background:rgba(255,107,107,.15);color:#ff8b8b;border-color:rgba(255,107,107,.3);}
.gdi-central-main{display:flex;flex:1;min-height:0;width:100%;}
.gdi-central-sidebar{width:220px;flex-shrink:0;background:var(--ferreto-bg-2,#0d1119);border-right:1px solid var(--ferreto-border,#21262d);overflow-y:auto;padding:14px 10px;display:flex;flex-direction:column;gap:2px;}
.gdi-central-sidebar::-webkit-scrollbar{width:6px;}
.gdi-central-sidebar::-webkit-scrollbar-thumb{background:var(--ferreto-border,#21262d);border-radius:3px;}
.gdi-central-sidebar-group{margin-top:14px;padding:0 8px;}
.gdi-central-sidebar-group:first-child{margin-top:0;}
.gdi-central-sidebar-label{font-size:10px;font-weight:700;color:var(--ferreto-text-faint,#6b7488);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px;padding:0 8px;}
.gdi-central-tab{display:flex;align-items:center;gap:10px;background:none;border:0;color:var(--ferreto-text-muted,#8b949e);padding:9px 12px;cursor:pointer;font-size:13px;border-radius:8px;transition:all .15s;font-family:var(--ferreto-font-body,'Rubik',sans-serif);width:100%;text-align:left;}
.gdi-central-tab:hover{background:var(--ferreto-surface-2,rgba(255,255,255,.05));color:var(--ferreto-text,#f0f6fc);}
.gdi-central-tab.active{background:linear-gradient(135deg,rgba(255,139,159,.18),rgba(93,222,218,.08));color:var(--ferreto-text,#f0f6fc);box-shadow:inset 0 0 0 1px rgba(255,139,159,.25);}
.gdi-central-tab i{font-size:15px;width:18px;text-align:center;flex-shrink:0;}
.gdi-central-tab.active i{color:var(--ferreto-primary,#ff8b9f);}
.gdi-central-tab .gdi-tab-badge{margin-left:auto;background:var(--ferreto-primary,#ff8b9f);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:999px;min-width:18px;text-align:center;}
.gdi-central-body{flex:1;overflow-y:auto;padding:24px;color:var(--ferreto-text,#f0f6fc);animation:gdi-tab-in .2s ease;}
@keyframes gdi-tab-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.gdi-central-body::-webkit-scrollbar{width:8px;}
.gdi-central-body::-webkit-scrollbar-thumb{background:var(--ferreto-border,#21262d);border-radius:4px;}
.gdi-central-body::-webkit-scrollbar-thumb:hover{background:var(--ferreto-border-strong,#30363d);}
.gdi-courses{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;}
.gdi-course{background:linear-gradient(135deg,var(--ferreto-surface-2,rgba(255,255,255,.04)),rgba(255,255,255,.02));border:1px solid var(--ferreto-border,#21262d);border-radius:16px;padding:18px;transition:all .2s cubic-bezier(.4,0,.2,1);position:relative;overflow:hidden;}
.gdi-course::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--ferreto-grad);opacity:0;transition:opacity .2s;}
.gdi-course:hover{border-color:rgba(255,139,159,.3);transform:translateY(-3px);box-shadow:0 12px 32px -8px rgba(0,0,0,.4);}
.gdi-course:hover::before{opacity:1;}
.gdi-course b{color:var(--ferreto-text,#f0f6fc);font-size:14px;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-weight:600;}
.gdi-course small{color:var(--ferreto-text-muted,#8b949e);font-size:11px;display:block;margin:6px 0 12px;}
.gdi-course-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0;}
.gdi-course-stat{background:var(--ferreto-surface-3,rgba(255,255,255,.04));border-radius:8px;padding:8px 6px;text-align:center;}
.gdi-course-stat-num{font-size:18px;font-weight:700;color:var(--ferreto-text,#f0f6fc);display:block;font-family:var(--ferreto-font-display,'Poppins',sans-serif);}
.gdi-course-stat-label{font-size:9px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;display:block;}
.gdi-progress-bar{height:6px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:3px;overflow:hidden;margin:10px 0;}
.gdi-progress-fill{height:100%;background:var(--ferreto-grad);border-radius:3px;transition:width .5s cubic-bezier(.4,0,.2,1);}
.gdi-btn-continue{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;background:var(--ferreto-grad);color:#fff;border:0;border-radius:10px;cursor:pointer;font-size:13px;font-weight:600;font-family:var(--ferreto-font-body,'Rubik',sans-serif);transition:all .15s;}
.gdi-btn-continue:hover{filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 6px 18px -4px var(--ferreto-glow);}
.gdi-btn-continue:disabled{opacity:.5;cursor:default;filter:none;transform:none;box-shadow:none;}
.gdi-btn-continue.gdi-btn-done{background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3);}
.gdi-empty-state{padding:60px 20px;text-align:center;}
.gdi-empty-state-icon{font-size:64px;line-height:1;margin-bottom:16px;opacity:.5;display:block;}
.gdi-empty-state h3{color:var(--ferreto-text,#f0f6fc);font-size:18px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);margin:0 0 8px;font-weight:600;}
.gdi-empty-state p{color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0 0 20px;line-height:1.6;max-width:400px;margin-left:auto;margin-right:auto;}
.gdi-dashboard-hero{background:linear-gradient(135deg,rgba(255,139,159,.12),rgba(93,222,218,.08));border:1px solid var(--ferreto-border,#21262d);border-radius:18px;padding:24px;margin-bottom:20px;position:relative;overflow:hidden;}
.gdi-dashboard-hero::after{content:'';position:absolute;top:-50%;right:-20%;width:60%;height:200%;background:radial-gradient(ellipse,rgba(255,139,159,.08),transparent 70%);pointer-events:none;}
.gdi-dashboard-hero h2{color:var(--ferreto-text,#f0f6fc);font-size:22px;font-family:var(--ferreto-font-display,'Poppins',sans-serif);margin:0 0 6px;font-weight:700;}
.gdi-dashboard-hero p{color:var(--ferreto-text-muted,#8b949e);font-size:13px;margin:0;}
.gdi-dashboard-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:20px;}
.gdi-dashboard-card{background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);border-radius:14px;padding:16px;cursor:pointer;transition:all .2s;}
.gdi-dashboard-card:hover{border-color:rgba(255,139,159,.3);transform:translateY(-2px);}
.gdi-dashboard-card-icon{font-size:28px;display:block;margin-bottom:8px;}
.gdi-dashboard-card-num{font-size:24px;font-weight:700;color:var(--ferreto-text,#f0f6fc);font-family:var(--ferreto-font-display,'Poppins',sans-serif);display:block;}
.gdi-dashboard-card-label{font-size:11px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.05em;margin-top:2px;display:block;}
.gdi-dashboard-card-meta{font-size:11px;color:var(--ferreto-text-faint,#6b7488);margin-top:6px;display:block;}
.gdi-quick-actions{display:flex;gap:8px;flex-wrap:wrap;}
.gdi-quick-action{display:flex;align-items:center;gap:6px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#21262d);color:var(--ferreto-text,#e6edf3);padding:10px 14px;border-radius:10px;cursor:pointer;font-size:13px;font-family:var(--ferreto-font-body,'Rubik',sans-serif);transition:all .15s;}
.gdi-quick-action:hover{background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-color:rgba(255,139,159,.3);transform:translateY(-1px);}
.gdi-quick-action i{color:var(--ferreto-primary,#ff8b9f);}
.heat-wrap{width:100%;overflow-x:auto;padding-bottom:6px;}
.heat{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,13px);grid-template-columns:repeat(auto-fill,minmax(13px,1fr));gap:3px;width:100%;min-width:100%;}
.heat i{width:13px;height:13px;border-radius:3px;background:var(--ferreto-surface-3,rgba(255,255,255,.08));display:block;transition:transform .15s;}
.heat i:hover{transform:scale(1.4);}
.heat i.l1{background:#0e4429}.heat i.l2{background:#006d32}.heat i.l3{background:#26a641}.heat i.l4{background:#39d353}
.gdi-central-box select, .gdi-central-box select option, .gdi-central-box optgroup {
  color-scheme: dark light;
  background: var(--ferreto-bg-2,#0d1119);
  color: var(--ferreto-text,#e6edf3);
}
[data-bs-theme="light"] .gdi-central-box select,
[data-bs-theme="light"] .gdi-central-box select option,
[data-bs-theme="light"] .gdi-central-box optgroup {
  color-scheme: light; background: #fff; color: #1f2540;
}
.gdi-modal-overlay{z-index:100000!important;}
.gdi-fc{background:var(--ferreto-surface-2,rgba(255,255,255,.045));border:1px solid var(--ferreto-border-strong,#30363d);border-radius:14px;padding:26px 20px;min-height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;cursor:pointer;max-width:560px;margin:0 auto;}
@media(max-width:768px){
  .gdi-central-sidebar{width:60px;padding:10px 6px;}
  .gdi-central-sidebar-group{padding:0 4px;}
  .gdi-central-sidebar-label{display:none;}
  .gdi-central-tab{padding:9px 8px;justify-content:center;}
  .gdi-central-tab span,.gdi-central-tab .gdi-tab-badge{display:none;}
  .gdi-central-stats{display:none;}
  .gdi-central-head{padding:12px 14px;gap:10px;}
  .gdi-central-body{padding:16px;}
  .gdi-courses{grid-template-columns:1fr;}
  .gdi-course-stats{grid-template-columns:repeat(2,1fr);}
}
/* ★ Task 15: scan progress bar (lightweight background course scanner) */
.gdi-scan-bar-wrap{margin-top:6px;height:3px;background:var(--ferreto-surface-2,rgba(255,255,255,.08));border-radius:2px;overflow:hidden;}
.gdi-scan-progress{height:100%;background:var(--ferreto-secondary,#5ddeda);transition:width .3s;}
.gdi-scan-status{color:var(--ferreto-text-muted,#8b949e);font-size:10px;display:block;margin-top:2px;}
.gdi-scan-status .bi-arrow-repeat{animation:gdi-scan-spin 1s linear infinite;display:inline-block;}
@keyframes gdi-scan-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
/* ★ FIX 3 (Task 23): tiles deformados no Android — reduz padding/fontes/stats
   grid em telas < 480px. Antes o tile tinha 4 stats lado-a-lado + 2 botões
   lado-a-lado + barra de scan, ocupando ~340px de altura em telas de 360px.
   Agora stats viram 2x2, botões ficam menores e padding reduz. */
@media(max-width:480px){
  .gdi-course{padding:8px!important;}
  .gdi-course b{font-size:12px!important;}
  .gdi-course small{font-size:10px!important;margin:4px 0 8px!important;}
  .gdi-course-stats{grid-template-columns:repeat(2,1fr)!important;gap:4px!important;margin:8px 0!important;}
  .gdi-course-stat{padding:6px 4px!important;}
  .gdi-course-stat-num{font-size:16px!important;}
  .gdi-course-stat-label{font-size:8px!important;}
  .gdi-progress-bar{height:4px!important;margin:6px 0!important;}
  .gdi-btn-continue{font-size:11px!important;padding:6px 8px!important;border-radius:8px!important;}
  .gdi-scan-bar-wrap{margin-top:4px!important;}
  .gdi-scan-status{font-size:9px!important;}
  /* botão "Escanear agora" manual + botão scanning — reduz padding/font em mobile */
  .gdi-btn-scan-now{font-size:10px!important;padding:5px 8px!important;}
}
`;document.head.appendChild(s);
  }

  // ═══ Área do Aluno agora é uma ABA na navbar (não mais flutuante).
  // Injeta um .gdi-nav-btn em .gdi-nav-actions.
  // ★ PATCH A: injectNavButton coalesced via requestAnimationFrame.
  //   - removido o MutationObserver em .gdi-nav (subtree:true era caro)
  //   - removidos os 10× setTimeout(injectNavButton, i*300)
  //   - removidos os 2 Bus.onGlobal('page:change') redundantes
  //   - mantido 1 retry inicial + 1 listener page:change + 1 listener rows:appended
  function injectNavButton(){
    // 1) remove qualquer fab antigo (versão em cache pode ter criado)
    const oldFab=document.getElementById('gdi-central-fab');
    if(oldFab)oldFab.remove();

    // 2) injeta botão na navbar
    const actions=document.querySelector('.gdi-nav-actions');
    if(!actions)return false;
    if(actions.querySelector('#gdi-central-nav'))return true; // já injetou
    const btn=document.createElement('button');
    btn.id='gdi-central-nav';
    btn.className='gdi-nav-btn';
    btn.title='Área do Aluno (tecla C)';
    btn.innerHTML='<i class="bi bi-journal-bookmark-fill"></i><span class="d-none d-md-inline">Área do Aluno</span>';
    btn.onclick=()=>openPanel('home');
    // insere antes do botão de tema (se existir) ou no início
    const themeBtn=document.getElementById('theme-toggle');
    if(themeBtn)actions.insertBefore(btn,themeBtn);
    else actions.appendChild(btn);
    return true;
  }
  // ★ coalescing via requestAnimationFrame — múltiplas chamadas viram 1
  let _navRaf=0;
  function scheduleNavInject(){
    if(_navRaf)return;
    _navRaf=requestAnimationFrame(()=>{
      _navRaf=0;
      injectNavButton();
    });
  }
  // 1 retry inicial (substitui os 10 antigos)
  setTimeout(scheduleNavInject,300);
  // 1 listener page:change (substitui os 2 antigos)
  Bus.onGlobal('page:change',scheduleNavInject);
  // 1 listener rows:appended
  Bus.onGlobal('rows:appended',scheduleNavInject);
  // também registra como GDI_MODULE — o loader roda após a navbar estar pronta
  window.GDI_MODULES=window.GDI_MODULES||[];
  window.GDI_MODULES.push({name:'central-nav',init:function(){scheduleNavInject();}});
  // ★ PATCH A: MutationObserver em .gdi-nav REMOVIDO (era dispendioso e redundante)

  document.addEventListener('keydown',e=>{
    const t=e.target;
    if(t&&(t.tagName==='INPUT'||t.tagName==='TEXTAREA'||t.isContentEditable))return;
    if(e.ctrlKey||e.metaKey||e.altKey)return;
    if(e.key==='Escape'){closePanel();return;}
    const k=e.key.toLowerCase();
    if(k==='c'){
      if(panel&&panel.style.display!=='none')closePanel();
      else openPanel();
      return;
    }
    if(!FC.active||!panel||panel.style.display==='none')return;
    if(e.code==='Space'){e.preventDefault();FC.flip&&FC.flip();}
    else if(e.key==='1'||e.key==='2'||e.key==='3'){FC.grade&&FC.grade(+e.key);}
  });

  log('Área do Aluno ativa (v3.1 — URL ?central=1 abre direto + atalho tecla C)');

  // ★ Task 17: acesso direto por URL — ?central=1 abre o painel automaticamente
  // Funciona em qualquer página (home, pasta, vídeo). Espera os slots estarem prontos.
  // Suporta também ?central=questoes, ?central=resumos, etc. (abre direto numa aba)
  (function(){
    function tryOpenFromURL(){
      try{
        const params = new URLSearchParams(window.location.search);
        const central = params.get('central');
        if(central){
          // Espera GDIUser estar pronto (state carregado) antes de abrir
          const openNow = function(){
            const tab = (central === '1' || central === 'true') ? 'home' : central;
            openPanel(tab);
            // Limpa o parâmetro da URL (não fica reabrindo a cada navegação)
            try{
              const url = new URL(window.location.href);
              url.searchParams.delete('central');
              window.history.replaceState({}, '', url.toString());
            }catch(_){}
          };
          if(window.GDIUser && typeof window.GDIUser.ready === 'function'){
            window.GDIUser.ready().then(openNow).catch(openNow);
            // fallback: abre depois de 2s mesmo se ready() não resolver
            setTimeout(openNow, 2000);
          }else{
            setTimeout(openNow, 1500);
          }
          return true;
        }
      }catch(_){}
      return false;
    }
    // Tenta abrir imediatamente (se já logado) e também após page:change
    setTimeout(tryOpenFromURL, 1000);
    // ★ FIX 10 (Task 21): was `if(window.Bus)` — but Bus is declared with `const` in
    // app.min.js, so `window.Bus` is undefined. The check always failed, so tryOpenFromURL
    // was never re-run on page:change or user:ready. Use `typeof Bus !== 'undefined'`
    // (matches gdi-extras-loader.js line 121 pattern).
    if(typeof Bus !== 'undefined' && typeof Bus.onGlobal === 'function'){
      Bus.onGlobal('page:change', function(){
        setTimeout(tryOpenFromURL, 500);
      });
      Bus.onGlobal('user:ready', function(){
        setTimeout(tryOpenFromURL, 300);
      });
    }
  })();

})();

// ═══════════════════════════════════════════════════════════════
// M24: ESTUDO AVANÇADO — Provas, Redação, Radar, Adaptativo
// Fornece renderProvas/renderRedacao/renderRadar para o M22.
// Integra com /api/ai (Meggy) e extractPdfText (M9-ISA).
// ═══════════════════════════════════════════════════════════════
(function(){
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
  window.renderProvas=function(box){
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
  };

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
      const doc=await lib.getDocument({data:buf,disableFontFace:true}).promise;
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
      try{doc.destroy();}catch(_){}
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
    box.querySelector('#prova-back').onclick=()=>window.renderProvas(box);
  }

  // ── Render: Correção de Redação ──
  window.renderRedacao=function(box){
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
  };

  // ── Render: Mapa de Fracos ──
  window.renderRadar=function(box){
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
    const courses=(window.__gdiCollectCourses||function(){return []})();
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
          setTimeout(()=>{try{window._qFilterSubject=subj;}catch(_){}},200);
        }
      };
    });
  };

  console.log('[GDI Extras] M24 Estudo Avançado (provas/redação/radar) ativo');
})();

// ═══════════════════════════════════════════════════════════════
// BlackTie: TEMA VISUAL FERRETO PARA OS MÓDULOS EXTRAS
// Carrega fontes (Poppins/Rubik/Inter), fixa tokens e reaplica a
// linguagem visual Ferreto (coral #ff8b9f / teal #5ddeda) sobre os
// componentes próprios deste extras (debug, pomodoro, notas,
// materiais, playlist, sleep, skip-intro, continue-card, progress,
// Área do Aluno). Não altera lógica dos módulos.
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiFerretoExtras)return;window.__gdiFerretoExtras=true;
  console.log('[GDI Extras] BlackTie tema aplicado');

  // ── 1) Fontes Ferreto (Poppins / Rubik / Inter) ──
  if(!document.getElementById('gdi-ferreto-fonts')){
    const f=document.createElement('link');
    f.id='gdi-ferreto-fonts';f.rel='stylesheet';
    f.href='https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Rubik:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(f);
  }
  if(!document.querySelector('link[rel="preconnect"][href*="fonts.gstatic"]')){
    const p=document.createElement('link');p.rel='preconnect';p.crossOrigin='';p.href='https://fonts.gstatic.com';document.head.appendChild(p);
  }

  // ── 2) Tokens (espelha app.min.js p/ tornar extras autossuficiente) ──
  if(!document.getElementById('gdi-ferreto-tokens')){
    const t=document.createElement('style');t.id='gdi-ferreto-tokens';t.textContent=`
:root{
  --ferreto-primary:#ff8b9f;--ferreto-primary-600:#f5697f;--ferreto-secondary:#5ddeda;
  --ferreto-accent:#c026d3;--ferreto-radius:16px;--ferreto-radius-sm:10px;
  --ferreto-font-display:'Poppins','Rubik',system-ui,sans-serif;
  --ferreto-font-body:'Rubik','Inter',system-ui,sans-serif;
  --ferreto-grad:linear-gradient(135deg,#ff8b9f 0%,#c026d3 55%,#5ddeda 130%);
  --ferreto-grad-soft:linear-gradient(135deg,rgba(255,139,159,.16),rgba(93,222,218,.12));
  --ferreto-glow:rgba(255,139,159,.35);
}
[data-bs-theme="dark"]{
  --ferreto-bg:#070910;--ferreto-bg-2:#0d1119;
  --ferreto-surface:rgba(22,27,38,.72);--ferreto-surface-2:rgba(255,255,255,.045);--ferreto-surface-3:rgba(255,255,255,.08);
  --ferreto-border:rgba(255,255,255,.09);--ferreto-border-strong:rgba(255,255,255,.16);
  --ferreto-text:#f3f5fa;--ferreto-text-muted:#9aa4b8;--ferreto-text-faint:#6b7488;
}
[data-bs-theme="light"]{
  --ferreto-bg:#f4f5fb;--ferreto-bg-2:#e9ebf5;
  --ferreto-surface:rgba(255,255,255,.78);--ferreto-surface-2:rgba(255,255,255,.6);--ferreto-surface-3:rgba(15,23,42,.05);
  --ferreto-border:rgba(15,23,42,.1);--ferreto-border-strong:rgba(15,23,42,.18);
  --ferreto-text:#1f2540;--ferreto-text-muted:#5a6478;--ferreto-text-faint:#9aa1b4;
  --ferreto-glow:rgba(255,139,159,.28);
}
`;document.head.appendChild(t);
  }

  // ── 3) Estilização Ferreto dos componentes extras ──
  if(!document.getElementById('gdi-ferreto-extras-style')){
    const s=document.createElement('style');s.id='gdi-ferreto-extras-style';s.textContent=`

/* Debug panel */
.gdi-debug-wrap{background:var(--ferreto-bg-2)!important;border-top:2px solid var(--ferreto-primary)!important;border-radius:0!important;}
.gdi-debug-head{background:var(--ferreto-surface)!important;color:var(--ferreto-text-muted)!important;}
.gdi-debug-head:hover{background:var(--ferreto-surface-3)!important;}
.gdi-debug-head strong{color:var(--ferreto-text)!important;font-family:var(--ferreto-font-display)!important;}
.gdi-dbg-count{background:var(--ferreto-grad)!important;color:#fff!important;}
.gdi-debug-actions button{background:var(--ferreto-surface-2)!important;border-color:var(--ferreto-border)!important;color:var(--ferreto-text-muted)!important;border-radius:999px!important;padding:3px 12px!important;font-size:11px!important;}
.gdi-debug-actions button:hover{background:var(--ferreto-primary)!important;color:#fff!important;border-color:var(--ferreto-primary)!important;}
#gdi-debug-log{background:var(--ferreto-bg-2)!important;color:var(--ferreto-text)!important;}
.gdi-dbg-entry{border-bottom-color:var(--ferreto-border)!important;}
.gdi-dbg-pre{background:var(--ferreto-surface)!important;border-left-color:var(--ferreto-primary)!important;color:var(--ferreto-text-muted)!important;}

/* Materiais (tabs + body) */
.gdi-mat-head strong{color:var(--ferreto-text)!important;font-family:var(--ferreto-font-display)!important;}
#gdi-mat-status{color:var(--ferreto-text-muted)!important;}
.gdi-mat-tab{background:var(--ferreto-surface-2)!important;border-color:var(--ferreto-border)!important;color:var(--ferreto-text-muted)!important;border-radius:12px!important;transition:all .15s!important;}
.gdi-mat-tab i{color:var(--ferreto-secondary)!important;}
.gdi-mat-tab span{font-family:var(--ferreto-font-body)!important;}
.gdi-mat-tab:hover{background:var(--ferreto-surface-3)!important;color:var(--ferreto-text)!important;transform:translateY(-1px);}
.gdi-mat-tab.active{background:var(--ferreto-grad)!important;border:0!important;color:#fff!important;box-shadow:0 6px 16px -8px var(--ferreto-glow);}
.gdi-mat-tab.active i{color:#fff!important;}
.gdi-mat-body{background:var(--ferreto-surface)!important;border-color:var(--ferreto-border)!important;border-radius:var(--ferreto-radius)!important;}
.gdi-mat-empty{color:var(--ferreto-text-muted)!important;}
.gdi-mat-loading{color:var(--ferreto-text-muted)!important;}

/* Notas */
.gdi-notes{background:var(--ferreto-surface-2)!important;border-color:var(--ferreto-border)!important;border-radius:var(--ferreto-radius-sm)!important;}
.gdi-notes-head{color:var(--ferreto-text)!important;font-family:var(--ferreto-font-display)!important;}
#gdi-note-input{background:var(--ferreto-surface-2)!important;border-color:var(--ferreto-border)!important;color:var(--ferreto-text)!important;border-radius:10px!important;font-family:var(--ferreto-font-body)!important;}
#gdi-note-input:focus{border-color:var(--ferreto-primary)!important;box-shadow:0 0 0 4px var(--ferreto-glow)!important;outline:none!important;}
#gdi-note-time{color:var(--ferreto-primary)!important;}
#gdi-note-save{background:var(--ferreto-grad)!important;color:#fff!important;border:0!important;border-radius:999px!important;font-family:var(--ferreto-font-body)!important;font-weight:600!important;box-shadow:0 6px 16px -8px var(--ferreto-glow);}
#gdi-note-save:hover{filter:brightness(1.08);}
#gdi-notes-list{scrollbar-width:thin;}
.gdi-note{background:var(--ferreto-surface-3)!important;border-radius:10px!important;}
.gdi-note-time{color:var(--ferreto-primary)!important;}
.gdi-note-text{color:var(--ferreto-text)!important;}
.gdi-note-del{color:var(--ferreto-text-muted)!important;}
.gdi-note-del:hover{color:#ff6b6b!important;}
.gdi-note-mark{background:var(--ferreto-primary)!important;}
.gdi-note-mark:hover{background:#ffd43b!important;}

/* Pomodoro FAB + painel */
#gdi-pom-fab{background:conic-gradient(var(--ferreto-primary) calc(var(--pom-p,0)*1%),var(--ferreto-surface-3) 0)!important;box-shadow:0 6px 22px rgba(0,0,0,.5),0 0 0 1px var(--ferreto-border-strong)!important;}
#gdi-pom-fab::after{background:var(--ferreto-bg-2)!important;border-color:var(--ferreto-border)!important;}
#gdi-pom-fab>span{color:var(--ferreto-text)!important;}
#gdi-pom-fab.warning{animation:gdi-pom-pulse .8s ease-in-out infinite;}
@keyframes gdi-pom-pulse{0%,100%{box-shadow:0 6px 22px rgba(0,0,0,.5),0 0 0 1px var(--ferreto-border-strong);}50%{box-shadow:0 0 0 12px rgba(255,139,159,.25),0 6px 22px rgba(0,0,0,.5);}}
#gdi-pom-panel{background:var(--ferreto-surface)!important;-webkit-backdrop-filter:blur(20px)!important;backdrop-filter:blur(20px)!important;border-color:var(--ferreto-border-strong)!important;border-radius:var(--ferreto-radius)!important;box-shadow:0 20px 56px rgba(0,0,0,.6)!important;color:var(--ferreto-text)!important;}

/* Sleep button */
#gdi-sleep-btn{color:var(--ferreto-text-muted)!important;background:var(--ferreto-surface-2)!important;border:1px solid var(--ferreto-border)!important;border-radius:999px!important;}
#gdi-sleep-btn:hover{color:var(--ferreto-primary)!important;background:var(--ferreto-surface-3)!important;}

/* Skip intro */
#gdi-skip-intro{background:var(--ferreto-surface)!important;border:1px solid var(--ferreto-border-strong)!important;color:var(--ferreto-text)!important;border-radius:999px!important;font-family:var(--ferreto-font-body)!important;font-weight:600!important;box-shadow:0 8px 24px rgba(0,0,0,.5)!important;}
#gdi-skip-intro:hover{background:var(--ferreto-grad)!important;color:#fff!important;border:0!important;}

/* Progress / module prog chips */
#gdi-progress-line{color:var(--ferreto-text-muted)!important;}
.gdi-modprog{background:var(--ferreto-surface-2)!important;color:var(--ferreto-text-muted)!important;border-radius:999px!important;border:1px solid var(--ferreto-border)!important;}
.gdi-modprog b{color:var(--ferreto-secondary)!important;}

/* Continue card + Home card */
#gdi-home-card,.gdi-continue-card{background:var(--ferreto-surface)!important;border:1px solid var(--ferreto-border)!important;border-radius:var(--ferreto-radius)!important;box-shadow:0 6px 22px -10px rgba(0,0,0,.4)!important;-webkit-backdrop-filter:blur(14px)!important;backdrop-filter:blur(14px)!important;}

/* Playlist count badge */
#gdi-playlist-count{color:var(--ferreto-text-muted)!important;}

/* Player nav buttons (Anterior/Próxima) */
#gdi-player-nav .gdi-mode-btn{justify-content:center;}

/* Nota: marks sobre o player */
#gdi-note-marks .gdi-note-mark{border-color:var(--ferreto-bg-2)!important;}

/* Área do Aluno (M22) — painel flutuante */
.gdi-fc-panel,.gdi-fc-root,[class*="gdi-fc"]{background:var(--ferreto-surface)!important;border-color:var(--ferreto-border-strong)!important;border-radius:var(--ferreto-radius)!important;-webkit-backdrop-filter:blur(18px)!important;backdrop-filter:blur(18px)!important;color:var(--ferreto-text)!important;}

/* ★FIX tema: Continue-card (M13) */
#gdi-home-card{background:var(--ferreto-surface)!important;border:1px solid var(--ferreto-border)!important;-webkit-backdrop-filter:blur(14px)!important;backdrop-filter:blur(14px)!important;color:var(--ferreto-text)!important;}
#gdi-home-card *{color:inherit;}
#gdi-home-card [style*="color:#8b949e"],#gdi-home-card [style*="color: #8b949e"]{color:var(--ferreto-text-muted)!important;}
#gdi-home-card [style*="color:#f0f6fc"],#gdi-home-card [style*="color: #f0f6fc"]{color:var(--ferreto-text)!important;}
#gdi-home-card [style*="color:#7aa2ff"],#gdi-home-card [style*="color: #7aa2ff"]{color:var(--ferreto-primary)!important;}
#gdi-home-card .gdi-mode-btn{background:var(--ferreto-surface-2)!important;border:1px solid var(--ferreto-border)!important;color:var(--ferreto-text-muted)!important;}
#gdi-home-card .gdi-mode-btn:hover{background:var(--ferreto-surface-3)!important;color:var(--ferreto-primary)!important;}

/* ★FIX tema: Área do Aluno (M22) */
.gdi-central-box [style*="color:#8b949e"],.gdi-central-box [style*="color: #8b949e"]{color:var(--ferreto-text-muted)!important;}
.gdi-central-box [style*="color:#f0f6fc"],.gdi-central-box [style*="color: #f0f6fc"]{color:var(--ferreto-text)!important;}
.gdi-central-box [style*="color:#e6edf3"],.gdi-central-box [style*="color: #e6edf3"]{color:var(--ferreto-text)!important;}
.gdi-central-box [style*="color:#7aa2ff"],.gdi-central-box [style*="color: #7aa2ff"]{color:var(--ferreto-secondary)!important;}
.gdi-central-box [style*="background:rgba(255,255,255,.06)"],.gdi-central-box [style*="background: rgba(255, 255, 255, .06)"]{background:var(--ferreto-surface-2)!important;}
.gdi-central-box [style*="background:rgba(255,255,255,.07)"],.gdi-central-box [style*="background: rgba(255, 255, 255, .07)"]{background:var(--ferreto-surface-2)!important;}
.gdi-central-box [style*="background:rgba(255,255,255,.08)"],.gdi-central-box [style*="background: rgba(255, 255, 255, .08)"]{background:var(--ferreto-surface-3)!important;}
.gdi-central-box [style*="background:var(--ferreto-surface-3,rgba(255,255,255,.1))"],.gdi-central-box [style*="background: rgba(255, 255, 255, .1)"]{background:var(--ferreto-surface-3)!important;}
.gdi-central-box [style*="background:#1f6feb"]{background:var(--ferreto-grad)!important;}
.gdi-central-box [style*="border:1px solid #30363d"]{border-color:var(--ferreto-border)!important;}
.gdi-central-box [style*="border:1px solid rgba(255,255,255,.14)"]{border-color:var(--ferreto-border)!important;}
.gdi-central-box [style*="border-top:1px solid #21262d"]{border-top-color:var(--ferreto-border)!important;}
.gdi-central-box input{background:var(--ferreto-surface-2)!important;border:1px solid var(--ferreto-border)!important;color:var(--ferreto-text)!important;}
.gdi-central-box input:focus{border-color:var(--ferreto-primary)!important;box-shadow:0 0 0 3px var(--ferreto-glow)!important;outline:none!important;}
.gdi-central-box input::placeholder{color:var(--ferreto-text-faint)!important;}
.gdi-central-box .gdi-note{background:var(--ferreto-surface-3)!important;}
.gdi-central-box .gdi-note-del{color:var(--ferreto-text-muted)!important;}
.gdi-central-box .gdi-note-del:hover{color:#ff6b6b!important;}
.gdi-central-box .gdi-notes-empty{color:var(--ferreto-text-muted)!important;}

/* Scrollbar dos painéis internos */
#gdi-notes-list::-webkit-scrollbar,#gdi-debug-log::-webkit-scrollbar{width:8px;}
#gdi-notes-list::-webkit-scrollbar-thumb,#gdi-debug-log::-webkit-scrollbar-thumb{background:var(--ferreto-surface-3);border-radius:20px;}

`;document.head.appendChild(s);
  }

  // ── 4) Garante data-bs-theme em <html> p/ os tokens casarem ──
  if(!document.documentElement.getAttribute('data-bs-theme')){
    document.documentElement.setAttribute('data-bs-theme',localStorage.getItem('gdi-theme')||'dark');
  }

  // ── 5) FIX modal serrilhada (belt-and-suspenders do CSS) ──
  document.addEventListener('shown.bs.modal',function(ev){
    const dlg=ev.target&&ev.target.querySelector&&ev.target.querySelector('.modal-dialog');
    if(!dlg)return;
    dlg.style.transform='translateZ(0)';
    void dlg.offsetHeight;
    setTimeout(function(){dlg.style.transform='';},0);
  },true);
})();

// ═══════════════════════════════════════════════════════════════
// M-PLAYER-GUARD: WATCHDOG CONTRA VÍDEOS TRAVADOS
// Camada de segurança extra além do fix v2.6 (que removeu o loop do
// MutationObserver). Mesmo sem o loop, alguns streams do Drive
// expiram/ficam lentos e o player entra em buffering infinito sem
// evento de erro — a aba trava. Este watchdog monitora o <video>:
// se 15s sem progresso, faz retry silencioso (v.load); se travar de
// novo, mostra overlay [Recarregar][Continuar aguardando]. Também
// resolve autoplay bloqueado (hint de ▶).
// ═══════════════════════════════════════════════════════════════
(function(){
  const STALL_MS=15000;
  const FIRST_PLAY_HINT_MS=3500;

  if(!document.getElementById('gdi-stall-style')){
    const s=document.createElement('style');s.id='gdi-stall-style';s.textContent=`
.gdi-stall-overlay{position:absolute;inset:0;background:rgba(7,9,16,.82);
  -webkit-backdrop-filter:blur(7px);backdrop-filter:blur(7px);
  display:flex;align-items:center;justify-content:center;z-index:30;
  animation:ferreto-fade .2s ease;}
.gdi-stall-card{display:flex;flex-direction:column;align-items:center;gap:9px;text-align:center;padding:22px;max-width:340px;}
.gdi-stall-card .gdi-stall-ico{font-size:36px;color:var(--ferreto-primary,#ff8b9f);
  filter:drop-shadow(0 4px 14px rgba(255,139,159,.5));}
.gdi-stall-title{font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;font-weight:600;color:#fff;}
.gdi-stall-sub{font-size:12px;color:#9aa4b8;margin-bottom:8px;line-height:1.4;}
.gdi-stall-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;}
.gdi-play-hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:20;cursor:pointer;
  background:rgba(0,0,0,.28);opacity:0;transition:opacity .2s;pointer-events:none;}
.gdi-play-hint.show{opacity:1;pointer-events:auto;}
.gdi-play-hint .bi{font-size:54px;color:#fff;filter:drop-shadow(0 6px 20px rgba(0,0,0,.6));}
.gdi-play-hint small{position:absolute;bottom:18px;color:#fff;font-size:12px;opacity:.85;}
`;document.head.appendChild(s);
  }

  function attach(v){
    if(!v||v.__gdiGuard)return;v.__gdiGuard=true;
    const st={timer:null,retryUsed:false,lastT:v.currentTime||0,lastAt:Date.now(),
              overlay:null,hint:null,hintTimer:null};

    function clearTimer(){if(st.timer){clearTimeout(st.timer);st.timer=null;}}
    function clearOverlay(){if(st.overlay){st.overlay.remove();st.overlay=null;}}
    function arm(){clearTimer();st.timer=setTimeout(check,STALL_MS);}

    function check(){
      if(!v.parentNode){clearOverlay();clearTimer();return;}
      if(v.paused){arm();return;}
      const dt=(v.currentTime||0)-st.lastT;
      if(dt>0.1){
        st.lastT=v.currentTime||0;st.lastAt=Date.now();clearOverlay();arm();return;
      }
      if(Date.now()-st.lastAt>=STALL_MS){
        if(!st.retryUsed){
          st.retryUsed=true;
          console.warn('[GDI Player-Guard] vídeo parou — retry silencioso');
          try{
            const cur=v.currentTime;
            v.load();
            v.play().catch(function(){});
            const onCanPlay=function(){try{if(cur>0)v.currentTime=cur;}catch(_){}v.removeEventListener('loadedmetadata',onCanPlay);};
            v.addEventListener('loadedmetadata',onCanPlay,{once:true});
          }catch(_){}
          st.lastAt=Date.now();st.lastT=0;
          arm();
        }else{
          showOverlay();
        }
      }else{arm();}
    }

    function showOverlay(){
      if(st.overlay)return;
      const wrap=v.closest('.gdi-player-wrap')||v.parentNode;
      if(!wrap)return;
      st.overlay=document.createElement('div');
      st.overlay.className='gdi-stall-overlay';
      st.overlay.innerHTML=
        '<div class="gdi-stall-card">'+
          '<i class="bi bi-exclamation-triangle gdi-stall-ico"></i>'+
          '<div class="gdi-stall-title">O vídeo parece ter travado</div>'+
          '<div class="gdi-stall-sub">Sem progresso há '+Math.round(STALL_MS/1000)+'s. O stream do Drive pode ter expirado ou ficado lento.</div>'+
          '<div class="gdi-stall-actions">'+
            '<button class="gdi-btn gdi-btn-primary" data-act="reload"><i class="bi bi-arrow-clockwise"></i> Recarregar</button>'+
            '<button class="gdi-btn gdi-btn-ghost" data-act="wait">Continuar aguardando</button>'+
          '</div>'+
        '</div>';
      wrap.appendChild(st.overlay);
      st.overlay.querySelector('[data-act="reload"]').addEventListener('click',function(){
        clearOverlay();st.retryUsed=false;st.lastAt=Date.now();st.lastT=0;
        try{v.load();v.play().catch(function(){});}catch(_){}
        arm();
      });
      st.overlay.querySelector('[data-act="wait"]').addEventListener('click',function(){
        clearOverlay();st.lastAt=Date.now();arm();
      });
    }

    function showHint(){
      if(st.hint)return;
      const wrap=v.closest('.gdi-player-wrap')||v.parentNode;
      if(!wrap)return;
      st.hint=document.createElement('div');
      st.hint.className='gdi-play-hint';
      st.hint.innerHTML='<i class="bi bi-play-circle-fill"></i><small>Toque para iniciar</small>';
      st.hint.addEventListener('click',function(){
        v.muted=false;
        v.play().catch(function(){v.muted=true;v.play().catch(function(){});});
        hideHint();
      });
      wrap.appendChild(st.hint);
      requestAnimationFrame(function(){st.hint&&st.hint.classList.add('show');});
    }
    function hideHint(){if(st.hint){st.hint.remove();st.hint=null;}clearTimeout(st.hintTimer);}
    function armHint(){clearTimeout(st.hintTimer);st.hintTimer=setTimeout(function(){
      if(v.paused&&v.readyState<3)showHint();
    },FIRST_PLAY_HINT_MS);}

    v.addEventListener('timeupdate',function(){
      st.lastT=v.currentTime||0;st.lastAt=Date.now();if(st.overlay)clearOverlay();hideHint();
    });
    v.addEventListener('waiting',function(){arm();});
    v.addEventListener('playing',function(){st.lastAt=Date.now();if(st.overlay)clearOverlay();hideHint();arm();});
    v.addEventListener('stalled',function(){arm();});
    v.addEventListener('canplay',function(){hideHint();});
    v.addEventListener('play',function(){arm();armHint();});
    v.addEventListener('pause',function(){clearTimer();});
    v.addEventListener('error',function(){
      console.error('[GDI Player-Guard] erro de mídia',v.error);
      if(!st.retryUsed){st.retryUsed=true;try{v.load();v.play().catch(function(){});}catch(_){}arm();}
      else{showOverlay();}
    });
    v.addEventListener('ended',function(){clearTimer();clearOverlay();});

    arm();armHint();
    console.log('[GDI Player-Guard] monitorando vídeo');
  }

  Bus.onGlobal('media:ready',function(d){
    if(d&&d.type==='video'&&d.el)attach(d.el);
  });

  window.GDI_MODULES.push({name:'player-guard',init:function(){
    try{
      const v=document.querySelector('.gdi-player-wrap video');
      if(v)attach(v);
    }catch(_){}
  }});
})();

// ═══════════════════════════════════════════════════════════════
// M-COURSE-SCANNER (Task 15)
// Lightweight background scanner for manually-added courses.
// ----------------------------------------------------------------------------
// Principles:
//   • Lightweight  — runs in background, doesn't block UI
//   • Incremental  — scans 1 folder at a time, 500ms pause between
//   • Persistent   — saves state to localStorage + lessons.json to Drive
//   • Resumable    — if interrupted, continues from where it stopped
//   • Visible      — progress bar on the course tile (via onProgress callback)
//
// Uses window.gdiListAllFiles (worker bridge — doesn't freeze main thread).
// Max depth 3 levels — avoids scanning entire Drive subtrees.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';
  if(window.gdiCourseScanner)return;  // guard against duplicate bootstrap

  const LS_SCAN_PREFIX    = 'gdi-course-scan-';     // scanner state per course
  const LS_LESSONS_PREFIX = 'gdi-course-lessons-';  // lessons cache per course
  const SCAN_PAUSE_MS     = 500;                    // pause between subfolders
  const SCAN_BATCH        = 1;                      // 1 subfolder at a time (lightest)
  const SCAN_MAX_DEPTH    = 3;                      // don't go deeper than 3 levels

  // ── Scanner state (resumable) ──
  function getScanState(courseKey){
    try{const v=localStorage.getItem(LS_SCAN_PREFIX+courseKey);return v?JSON.parse(v):null}catch(_){return null}
  }
  function setScanState(courseKey, state){
    try{localStorage.setItem(LS_SCAN_PREFIX+courseKey, JSON.stringify(state))}catch(_){}
  }
  function clearScanState(courseKey){
    try{localStorage.removeItem(LS_SCAN_PREFIX+courseKey)}catch(_){}
  }

  // ── Lessons cache (per course) ──
  function getLessons(courseKey){
    try{
      const v=localStorage.getItem(LS_LESSONS_PREFIX+courseKey);
      return v?JSON.parse(v):{lessons:[],scanned:false,totalFolders:0,totalLessons:0};
    }catch(_){return {lessons:[],scanned:false,totalFolders:0,totalLessons:0}}
  }
  function setLessons(courseKey, data){
    try{localStorage.setItem(LS_LESSONS_PREFIX+courseKey, JSON.stringify(data))}catch(_){}
  }

  // Video extension matcher — same regex as app.min.js buildPlaylistFromFiles
  const VIDEO_EXT = /\.(mp4|webm|mkv|mov|m4v|avi|mpg|mpeg|wmv|flv|3gp)(\?|$)/i;

  // Scan ONE folder — returns {lessons:[], subfolders:[]}
  // Uses window.gdiListAllFiles (worker bridge — non-blocking).
  async function scanFolder(folderPath, depth){
    if(depth > SCAN_MAX_DEPTH) return {lessons:[], subfolders:[]};
    try{
      const pw = (typeof window.gdiGetPw === 'function') ? (window.gdiGetPw(folderPath)||'') : '';
      const files = (typeof window.gdiListAllFiles === 'function')
        ? await window.gdiListAllFiles(folderPath, pw)
        : [];
      if(!Array.isArray(files)) return {lessons:[], subfolders:[]};
      const lessons = [];
      const subfolders = [];
      for(let i=0; i<files.length; i++){
        const f = files[i];
        if(!f) continue;
        const name = f.name || '';
        const mime = f.mimeType || '';
        if(mime === 'application/vnd.google-apps.folder'){
          subfolders.push(f);
        } else if(mime.indexOf('video/') === 0 || VIDEO_EXT.test(name)){
          // It's a video lesson
          if(/\.part-/i.test(name)) continue;  // skip partial files
          const bytes = Number(f.size)||0;
          if(bytes && bytes < 1024*1024) continue;  // skip < 1MB (probably not a real lesson)
          lessons.push({
            name: name,
            path: folderPath + encodeURIComponent(name),
            folder: folderPath,
            size: bytes,
            mimeType: mime,
            depth: depth
          });
        }
      }
      return {lessons, subfolders};
    }catch(e){
      console.warn('[Scanner] erro escaneando', folderPath, e && e.message);
      return {lessons:[], subfolders:[]};
    }
  }

  // Compute folder depth relative to the course root path.
  // Each '/' in the path beyond the root counts as one level.
  function depthOf(folderPath, rootPath){
    try{
      const f = (folderPath||'').split('/').filter(Boolean).length;
      const r = (rootPath||'').split('/').filter(Boolean).length;
      return Math.max(0, f - r);
    }catch(_){return 0}
  }

  // Main scan function — incremental, resumable.
  // courseKey == coursePath (the Drive folder path, e.g. /4:/CANTE COM EXCELENCIA 2.0/)
  // Calls onProgress(state, lessonsData) after each folder.
  async function scanCourse(courseKey, onProgress){
    if(!courseKey)return null;

    // Load or create state
    let state = getScanState(courseKey);
    if(state && state.status === 'scanning'){
      // Already scanning — don't start another instance (constraint).
      // Wire onProgress to fire on the next state save by polling once.
      try{ if(onProgress) onProgress(state, getLessons(courseKey)); }catch(_){}
      return state;
    }

    state = state || {
      courseKey: courseKey,
      coursePath: courseKey,
      status: 'scanning',  // 'scanning' | 'done' | 'error' | 'paused'
      startedAt: Date.now(),
      scannedFolders: 0,
      totalFolders: 0,
      queue: [courseKey],  // folders to scan (BFS) — starts with the course root
      scanned: [],         // folders already scanned
      depth: 0
    };

    // If already done, skip (caller can still read lessons via getCourseLessons)
    if(state.status === 'done'){
      try{ if(onProgress) onProgress(state, getLessons(courseKey)); }catch(_){}
      return state;
    }

    state.status = 'scanning';
    state.error = null;
    setScanState(courseKey, state);

    const lessonsData = getLessons(courseKey);
    if(!Array.isArray(lessonsData.lessons)) lessonsData.lessons = [];

    // Process queue incrementally — 1 folder per iteration (SCAN_BATCH=1)
    let iter = 0;
    while(state.queue.length > 0){
      const folder = state.queue.shift();

      // Skip if already scanned (dedupe safety)
      if(state.scanned.indexOf(folder) >= 0) continue;
      state.scanned.push(folder);
      state.scannedFolders++;

      const depth = depthOf(folder, courseKey);

      // Scan this folder (via worker bridge — doesn't block UI)
      const result = await scanFolder(folder, depth);

      // Add lessons (dedupe by path)
      if(result.lessons && result.lessons.length){
        for(let i=0; i<result.lessons.length; i++){
          const l = result.lessons[i];
          let dup = false;
          for(let j=0; j<lessonsData.lessons.length; j++){
            if(lessonsData.lessons[j].path === l.path){ dup = true; break; }
          }
          if(!dup) lessonsData.lessons.push(l);
        }
      }

      // Queue subfolders (BFS) — only if depth < MAX
      if(depth < SCAN_MAX_DEPTH && result.subfolders && result.subfolders.length){
        for(let i=0; i<result.subfolders.length; i++){
          const sf = result.subfolders[i];
          if(!sf || !sf.name) continue;
          const subPath = folder + encodeURIComponent(sf.name) + '/';
          if(state.scanned.indexOf(subPath) < 0 && state.queue.indexOf(subPath) < 0){
            state.queue.push(subPath);
          }
        }
      }

      state.totalFolders = state.scannedFolders + state.queue.length;

      // Save state + lessons (resumable)
      setScanState(courseKey, state);
      lessonsData.scanned = false;
      lessonsData.totalFolders = state.totalFolders;
      lessonsData.totalLessons = lessonsData.lessons.length;
      setLessons(courseKey, lessonsData);

      // Progress callback (live updates tile)
      try{ if(onProgress) onProgress(state, lessonsData); }catch(_){}

      iter++;
      // ★ Pause between folders — don't block UI (constraint: 500ms)
      await new Promise(r => setTimeout(r, SCAN_PAUSE_MS));
    }

    // Done!
    state.status = 'done';
    state.completedAt = Date.now();
    setScanState(courseKey, state);

    lessonsData.scanned = true;
    lessonsData.totalFolders = state.scannedFolders;
    lessonsData.totalLessons = lessonsData.lessons.length;
    setLessons(courseKey, lessonsData);

    // Save to Drive — non-blocking. Uses GDIStorage.saveMaterial which POSTs
    // to /api/materials/save and stores under <userFolder>/lessons/<hash>.json
    // The kind='lessons' is a new convention for course structure files.
    try{
      if(window.GDIStorage && typeof window.GDIStorage.saveMaterial === 'function'){
        window.GDIStorage.saveMaterial(courseKey, courseKey, 'lessons', JSON.stringify(lessonsData)).catch(()=>{});
      }
    }catch(_){}

    try{ if(onProgress) onProgress(state, lessonsData); }catch(_){}
    return state;
  }

  // Get scan progress for a course (for tile display)
  function getScanProgress(courseKey){
    const state = getScanState(courseKey);
    if(!state) return null;
    const lessons = getLessons(courseKey);
    const total = state.totalFolders || state.scannedFolders || 0;
    return {
      status: state.status,            // 'scanning' | 'done' | 'error' | 'paused'
      scannedFolders: state.scannedFolders || 0,
      totalFolders: total,
      lessonsFound: (lessons.lessons||[]).length,
      percent: total > 0 ? Math.round((state.scannedFolders||0) / total * 100) : 0,
      error: state.error || null,
      startedAt: state.startedAt || null,
      completedAt: state.completedAt || null
    };
  }

  // Get lessons for a course (from cache)
  function getCourseLessons(courseKey){
    return getLessons(courseKey);
  }

  // Count watched lessons for a course (from GDIUser userstate.watched)
  // Matches by path prefix: any watched path that starts with courseKey
  function countWatched(courseKey){
    try{
      if(!window.GDIUser || typeof window.GDIUser.dump !== 'function') return 0;
      const dump = window.GDIUser.dump();
      if(!dump || !dump.watched) return 0;
      const watched = dump.watched;
      const pre = String(courseKey||'').toLowerCase();
      let count = 0;
      for(const k in watched){
        const lk = String(k).toLowerCase();
        if(lk === pre || lk.indexOf(pre + '/') === 0) count++;
      }
      return count;
    }catch(_){return 0}
  }

  // Start scan — non-blocking, runs in background.
  // onProgress(state, lessonsData) is called after each folder.
  function startScan(courseKey, onProgress){
    if(!courseKey){
      console.warn('[Scanner] startScan chamado sem courseKey');
      return;
    }
    // Check if already scanning (constraint: no multiple instances per course)
    // ★ Task 27: se o scan foi iniciado há mais de 10min, considera travado e reinicia
    const existing = getScanState(courseKey);
    if(existing && existing.status === 'scanning'){
      const ageMin = existing.startedAt ? (Date.now() - existing.startedAt) / 60000 : 0;
      if(ageMin > 10){
        console.log('[Scanner] scan travado há', Math.round(ageMin), 'min — reiniciando', courseKey);
        // não retorna — continua pra reiniciar
      }else{
        console.log('[Scanner] scan já em andamento para', courseKey, '— não iniciando duplicata');
        try{ if(onProgress) onProgress(existing, getLessons(courseKey)); }catch(_){}
        return;
      }
    }
    // Fire-and-forget — errors captured and saved to state
    scanCourse(courseKey, onProgress).catch(e=>{
      console.error('[Scanner] erro fatal:', e && e.message);
      const state = getScanState(courseKey);
      if(state){
        state.status = 'error';
        state.error = e && e.message || String(e);
        setScanState(courseKey, state);
        try{ if(onProgress) onProgress(state, getLessons(courseKey)); }catch(_){}
      }
    });
  }

  // Resume any interrupted scans on page load (e.g., user reloaded mid-scan)
  function resumeInterruptedScans(){
    try{
      const manual = JSON.parse(localStorage.getItem('gdi-manual-courses-v1') || '[]');
      if(!Array.isArray(manual)) return;
      for(const m of manual){
        if(!m || !m.path) continue;
        const state = getScanState(m.path);
        if(state && state.status === 'scanning'){
          // Status was 'scanning' when page unloaded — resume
          console.log('[Scanner] resumindo scan interrompido:', m.path);
          startScan(m.path, null);
        }
      }
    }catch(_){}
  }

  // ─────────────────────────────────────────────────────────────
  // ★ Task 16 / FIX 1: Auto-scan courses that haven't been scanned yet.
  // Courses added BEFORE the scanner (Task 15) was implemented have no scan
  // state, so collectCourses() falls back to pdfCount||0 (which is 0 for old
  // courses). This auto-scan picks the FIRST course without a 'done' state
  // and starts a non-blocking scan. Limited to 1 concurrent scan.
  // ─────────────────────────────────────────────────────────────
  let _autoScanRunning = false;
  function autoScanPending(){
    if(_autoScanRunning) return;
    _autoScanRunning = true;
    try{
      const manual = JSON.parse(localStorage.getItem('gdi-manual-courses-v1') || '[]');
      if(!Array.isArray(manual) || !manual.length){ _autoScanRunning = false; return; }

      // Find first course that needs scanning (no state OR not done/scanning)
      for(const c of manual){
        if(!c || !c.path) continue;
        // Skip drive-root paths (they're not real courses — Task 16 / FIX 3)
        if(/^\d+:\/$/.test(c.path)) continue;
        const sp = getScanProgress(c.path);
        if(!sp || (sp.status !== 'done' && sp.status !== 'scanning')){
          console.log('[Scanner] auto-scan iniciando para:', c.name || c.path);
          startScan(c.path, function(state, lessonsData){
            // Re-render home if it's the active tab
            if(state.status === 'done' || state.status === 'error'){
              console.log('[Scanner] auto-scan concluído:', c.name, '-',
                (lessonsData ? lessonsData.lessons.length : 0), 'aulas');
              try{
                const body = document.getElementById('gdi-central-body');
                if(body && window.__gdiCurrentTab === 'home' && typeof renderHome === 'function'){
                  renderHome(body);
                }
              }catch(_){}
            }
          });
          break;  // only 1 at a time
        }
      }
    }catch(_){}
    _autoScanRunning = false;
  }

  // ─────────────────────────────────────────────────────────────
  // ★ Task 16 / FIX 3: Cleanup orphan courses from student's memory.
  // Before Task 14, collectCourses() created auto-tiles from watched/resume/
  // history, and some drive-root paths (e.g. /0:/, /4:/) ended up persisted
  // in gdi-manual-courses-v1. This cleanup removes:
  //   - Drive root paths (^\d+:/)
  //   - Paths with <2 segments (e.g. /0:/)
  //   - Entries with no name or empty name
  // Returns the number of removed entries.
  // ─────────────────────────────────────────────────────────────
  function cleanupOrphanCourses(){
    try{
      const manual = JSON.parse(localStorage.getItem('gdi-manual-courses-v1') || '[]');
      if(!Array.isArray(manual)) return 0;

      const original = manual.length;
      const cleaned = manual.filter(c => {
        if(!c || !c.path) return false;
        // Remove drive roots (e.g., /0:/, /4:/)
        if(/^\d+:\/$/.test(c.path)) return false;
        // Remove if path is just /<drive>:/ (no subfolder)
        const segs = c.path.split('/').filter(Boolean);
        if(segs.length < 2) return false;
        // Remove if no name
        if(!c.name || !c.name.trim()) return false;
        return true;
      });

      if(cleaned.length !== original){
        localStorage.setItem('gdi-manual-courses-v1', JSON.stringify(cleaned));
        console.log('[Cleanup] removidos', original - cleaned.length,
          'cursos órfãos. Restam:', cleaned.length);
        return original - cleaned.length;
      }
      return 0;
    }catch(_){ return 0; }
  }

  // Export
  window.gdiCourseScanner = {
    startScan,
    scanCourse,
    getScanProgress,
    getCourseLessons,
    countWatched,
    clearScanState,
    resumeInterruptedScans,
    autoScanPending,
    cleanupOrphanCourses,
    LS_SCAN_PREFIX,
    LS_LESSONS_PREFIX,
    SCAN_PAUSE_MS,
    SCAN_MAX_DEPTH,
    version: '1.1'
  };

  // ★ Task 16 / FIX 3: expose cleanup as a standalone global for console access
  window.gdiCleanupOrphanCourses = cleanupOrphanCourses;

  // Auto-resume interrupted scans after a short delay (lets GDIUser + worker bridge init)
  setTimeout(function(){
    try{ resumeInterruptedScans(); }catch(_){}
  }, 3000);

  // ★ Task 16 / FIX 3: run orphan cleanup on page load (2s — early, before auto-scan)
  setTimeout(function(){
    try{ cleanupOrphanCourses(); }catch(_){}
  }, 2000);

  // ★ Task 16 / FIX 1: auto-scan pending courses 5s after page load (after GDIUser ready)
  if(typeof Bus !== 'undefined' && typeof Bus.onGlobal === 'function'){
    Bus.onGlobal('user:ready', function(){
      setTimeout(function(){
        try{ autoScanPending(); }catch(_){}
      }, 5000);
    });
    // Also try on page:change (in case user navigates and modules are ready)
    Bus.onGlobal('page:change', function(){
      setTimeout(function(){
        try{ autoScanPending(); }catch(_){}
      }, 3000);
    });
  }else{
    // Fallback if Bus not available at IIFE init time
    setTimeout(function(){
      try{ autoScanPending(); }catch(_){}
    }, 5000);
  }

  console.log('[GDI Course Scanner] v1.1 — lightweight background scanner ativo (pause='+SCAN_PAUSE_MS+'ms, maxDepth='+SCAN_MAX_DEPTH+') + auto-scan + orphan cleanup');
})();

// ═══════════════════════════════════════════════════════════════
// FIM do gdi-study.js — Área do Aluno (refatorado v3.0)
// Patches A-H aplicados · Tabs removidas · Paginação em Questões/Provas/Cronograma
// APIs públicas preservadas: window.renderQuestoes/renderSimulado/
// renderCronograma/renderRevisoes/renderCursos/renderMarathon/renderFlash/
// renderSubjects/renderTrails/renderProvas/renderRedacao/renderRadar/
// gdiAddCourseFromButton/gdiAddCourseFromDrive/gdiRefreshCentralPanel/
// __gdiOpenCentral/__gdiGradeQ + GDI_MODULES['central-nav'] + GDI_MODULES['player-guard']
// Task 15: window.gdiCourseScanner (lightweight background course scanner)
// ═══════════════════════════════════════════════════════════════
