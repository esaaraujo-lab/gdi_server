// ═══════════════════════════════════════════════════════════════
// study-tabs-legacy.js — Stub tab handlers (Flashcards/Maratona/Matérias/Trilhas)
//
// Split from gdi-study.js (v1.0.86 modularization, Task v86-MOD-STUDY).
// Carved out of IIFE #2 "M22 — Área do Aluno" (lines 3119-3627, ~509 lines).
//
// These tabs were REMOVED from the sidebar (per user request) but the
// functions are preserved as API stubs. Candidates for future deletion.
//
// Owns: renderFlash, studyFlash, renderMarathon, renderSubjects, editSubject,
//       renderTrails, editTrail
//
// Namespace: window.__gdiStudy.legacy = {
//                renderFlash, studyFlash, renderMarathon,
//                renderSubjects, editSubject, renderTrails, editTrail
//            }
// Aliases:   window.renderFlash, window.renderMarathon,
//            window.renderSubjects, window.renderTrails (preserved for compat)
// Guard:     window.__gdiStudyLegacy (prevents double-init)
// Depends on: window.gdiGradeCard (SRS), window.gdiSubjects, window.gdiTrails,
//             window.gdiVideoKey, window.gdiModal, window.escHtml, window.showToast
// Late binding:
//   - FC (flashcard session state) shared with study-panel.js via
//     window.__gdiStudy.state.FC. study-panel.js owns the state object
//     (loads LAST); this module defensively creates a stub state.FC if
//     study-panel.js hasn't loaded yet.
// Load order: 6th study module (after advanced, before player-guard)
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiStudyLegacy) return;
  window.__gdiStudyLegacy = true;
  window.__gdiStudy = window.__gdiStudy || {};

  // ── Defensive state.FC init (study-panel.js loads LAST and owns state; ──
  //    create a stub here so studyFlash can mutate FC even if panel isn't
  //    loaded yet — e.g. if a caller invokes studyFlash before openPanel).
  window.__gdiStudy.state = window.__gdiStudy.state || {
    panel: null,
    tab: 'home',
    currentTab: 'home',
    FC: {active:false, flip:null, grade:null}
  };
  if(!window.__gdiStudy.state.FC){
    window.__gdiStudy.state.FC = {active:false, flip:null, grade:null};
  }

  // ── Local utils (mirror M22 closure utils; small enough to duplicate) ──
  const lsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const lsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  const dec=s=>{try{return decodeURIComponent(String(s||''))}catch(_){return String(s||'')}};
  const norm=p=>dec(String(p||'').split('?')[0].replace(/\/+$/,''));
  const stripExt=s=>String(s||'').replace(/\.[a-z0-9]{1,5}$/i,'').trim();
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

  // ── LS keys (same as M22) ──
  const LS_CARDS='gdi-cards-v1', LS_MAR='gdi-marathon', LS_MARINTRO='gdi-marathon-intro';

  // ── Flashcard data helpers (1-liner wrappers around lsGet/lsSet) ──
  const cards=()=>lsGet(LS_CARDS,[]);
  const saveCards=c=>lsSet(LS_CARDS,c);
  const dueCards=()=>cards().filter(c=>(c.due||0)<=Date.now());

  // ── Marathon helpers ──
  const marOn=()=>lsGet(LS_MAR,false)===true;
  const marIntro=()=>lsGet(LS_MARINTRO,true)!==false;

  // ── FC shared state accessor (mutates window.__gdiStudy.state.FC) ──
  function FC(){
    // Always return the live shared object so property writes propagate
    // to study-panel.js's keydown handler (which reads FC.flip / FC.grade).
    return window.__gdiStudy.state.FC;
  }

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
  // ★ expõe renderFlash para a API pública
  window.renderFlash=renderFlash;

  function studyFlash(box){
    const queue=dueCards();
    if(!queue.length){renderFlash(box);return;}
    let i=0,ok=0;
    function draw(){
      if(i>=queue.length){
        FC().active=false;
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
      FC().flip=flip;
      FC().grade=grade;
      FC().active=true;
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

  // ── Namespace exposure ──
  window.__gdiStudy.legacy = {
    renderFlash: renderFlash,
    studyFlash: studyFlash,
    renderMarathon: renderMarathon,
    renderSubjects: renderSubjects,
    editSubject: editSubject,
    renderTrails: renderTrails,
    editTrail: editTrail,
    // Data helpers (shared via namespace; study-panel.js uses its own
    // lsGet(LS_CARDS,[]) calls — these are here for completeness).
    cards: cards,
    saveCards: saveCards,
    dueCards: dueCards,
    marOn: marOn,
    marIntro: marIntro
  };

  // ── Backward-compat aliases (preserved from monolith) ──
  // window.renderFlash, window.renderMarathon, window.renderSubjects,
  // window.renderTrails are already assigned above (verbatim from monolith).
  // Re-assert via namespace indirection for consistency with other modules.
  window.renderFlash = function(box){ return window.__gdiStudy.legacy.renderFlash.apply(this, arguments); };
  window.renderMarathon = function(box){ return window.__gdiStudy.legacy.renderMarathon.apply(this, arguments); };
  window.renderSubjects = function(box){ return window.__gdiStudy.legacy.renderSubjects.apply(this, arguments); };
  window.renderTrails = function(box){ return window.__gdiStudy.legacy.renderTrails.apply(this, arguments); };

  console.log('[GDI Extras] M22 legacy tab stubs (flash/marathon/subjects/trails) ativos — modular (candidatos a remoção futura)');
})();
