// ═══════════════════════════════════════════════════════════════
// study-plan.js — v1.0.139: Plano de Estudo Adaptativo
// O aluno define uma meta (concurso/vestibular + data + horas/dia).
// O sistema gera um plano semanal baseado nos cursos + fraquezas + SRS.
// Plano é salvo no Drive (per-user) e carregado no login.
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  function escHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  let _planCache=null, _planCacheAt=0;
  const PLAN_TTL=300000; // 5min

  async function fetchPlan(force){
    if(!force && _planCache && (Date.now()-_planCacheAt)<PLAN_TTL) return _planCache;
    try{
      const r=await fetch('/api/study-plan/load',{credentials:'same-origin'});
      if(!r.ok)return null;
      const d=await r.json();
      if(!d||!d.ok)return null;
      _planCache=d.plan;
      _planCacheAt=Date.now();
      return d.plan;
    }catch(_){return null;}
  }

  async function generatePlan(goal, examDate, dailyHours){
    try{
      const r=await fetch('/api/study-plan/generate',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({goal, examDate, dailyHours})
      });
      if(!r.ok)return null;
      const d=await r.json();
      if(!d||!d.ok)return null;
      return d.plan;
    }catch(_){return null;}
  }

  async function savePlan(goal, examDate, dailyHours, plan){
    try{
      const r=await fetch('/api/study-plan/save',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({goal, examDate, dailyHours, plan})
      });
      return r.ok;
    }catch(_){return false;}
  }

  function fmtHours(h){
    h=Math.round(h*2)/2;
    if(h<1)return Math.round(h*60)+'min';
    return h%1===0?h+'h':Math.floor(h)+'h30';
  }

  function renderSetup(container){
    container.innerHTML=`
      <div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:12px;padding:20px;">
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:32px;">🎯</div>
          <h3 style="color:var(--ferreto-text,#f0f6fc);margin:8px 0 4px;font-size:16px;">Plano de Estudo</h3>
          <p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0;">Defina sua meta e a Meggy cria um plano personalizado</p>
        </div>
        <div style="display:grid;gap:12px;max-width:400px;margin:0 auto;">
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;">Tipo de prova</label>
            <select id="gdi-plan-goal" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface,rgba(0,0,0,.3));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;">
              <option value="concurso">Concurso Público</option>
              <option value="enem">ENEM</option>
              <option value="vestibular">Vestibular</option>
              <option value="oab">OAB</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;">Data da prova</label>
            <input type="date" id="gdi-plan-date" style="width:100%;box-sizing:border-box;background:var(--ferreto-surface,rgba(0,0,0,.3));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;">
          </div>
          <div>
            <label style="display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;text-transform:uppercase;">Horas por dia: <span id="gdi-plan-hours-label" style="color:var(--ferreto-primary,#ff8b9f);">3h</span></label>
            <input type="range" id="gdi-plan-hours" min="1" max="8" value="3" step="0.5" style="width:100%;accent-color:var(--ferreto-primary,#ff8b9f);">
          </div>
          <button id="gdi-plan-generate" class="gdi-btn gdi-btn-primary" style="width:100%;font-size:14px;margin-top:8px;">
            <i class="bi bi-magic"></i> Gerar meu plano
          </button>
        </div>
      </div>
    `;

    const hoursInput=container.querySelector('#gdi-plan-hours');
    const hoursLabel=container.querySelector('#gdi-plan-hours-label');
    if(hoursInput&&hoursLabel){
      hoursInput.oninput=()=>{hoursLabel.textContent=fmtHours(parseFloat(hoursInput.value));};
    }

    const btn=container.querySelector('#gdi-plan-generate');
    if(btn)btn.onclick=async()=>{
      const goal=container.querySelector('#gdi-plan-goal').value;
      const examDate=container.querySelector('#gdi-plan-date').value;
      const dailyHours=parseFloat(container.querySelector('#gdi-plan-hours').value);
      btn.disabled=true;
      btn.innerHTML='<div class="gdi-mat-isa-spin" style="width:14px;height:14px;display:inline-block;"></div> Gerando...';
      const plan=await generatePlan(goal, examDate, dailyHours);
      if(plan){
        await savePlan(goal, examDate, dailyHours, plan);
        _planCache=null; // invalida cache
        renderPlan(container, {goal, examDate, dailyHours, plan, savedAt:Date.now()});
      }else{
        btn.disabled=false;
        btn.innerHTML='<i class="bi bi-magic"></i> Tentar novamente';
        btn.style.background='#ff6b6b';
      }
    };
  }

  function renderPlan(container, savedPlan){
    const plan=savedPlan.plan||savedPlan;
    // ★ v2.15.6-banca: planos já salvos no Drive só têm `week` (o gerador
    //   legado não devolvia weekSchedule) — normaliza p/ o formato que o
    //   render entende, senão o plano gerado nunca aparece (o bug que o
    //   Elton reportou: "Gerar meu plano" não fazia nada).
    if(plan&&!plan.weekSchedule&&Array.isArray(plan.week)){
      plan.weekSchedule=plan.week.map(function(d){
        return { day: d.day, tasks: (d.blocks||[]).map(function(b){ return { course: b.subject, hours: Math.round(parseInt(b.duration,10)/60*2)/2, note: b.time }; }) };
      });
    }
    if(!plan||!plan.weekSchedule){
      renderSetup(container);
      return;
    }

    const today=new Date().getDay();
    const todayIdx=today===0?6:today-1;
    const todayPlan=plan.weekSchedule[todayIdx]||plan.weekSchedule[0];
    const isTodayRest=todayPlan&&todayPlan.type==='descanso';

    // Tarefas de hoje
    let todayHtml='';
    if(todayPlan){
      if(todayPlan.type==='descanso'){
        todayHtml=`<div style="text-align:center;padding:20px;color:var(--ferreto-text-muted,#8b949e);">😴 ${escHtml(todayPlan.tasks[0]||'Descanso')}</div>`;
      }else{
        todayHtml=(todayPlan.tasks||[]).map(t=>{
          if(typeof t==='string')return `<div style="padding:8px;color:var(--ferreto-text,#e6edf3);font-size:12px;">${escHtml(t)}</div>`;
          const icon=t.type==='srs'?'🃏':'▶️';
          return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--ferreto-surface,rgba(0,0,0,.2));border-radius:6px;margin-bottom:4px;">
            <span style="font-size:14px;">${icon}</span>
            <div style="flex:1;">
              <div style="color:var(--ferreto-text,#e6edf3);font-size:12px;font-weight:600;">${escHtml(t.course)}</div>
              ${t.note?`<div style="color:var(--ferreto-text-muted,#8b949e);font-size:10px;">${escHtml(t.note)}</div>`:''}
            </div>
            <span style="color:var(--ferreto-primary,#ff8b9f);font-size:11px;font-weight:600;">${fmtHours(t.hours||1)}</span>
          </div>`;
        }).join('');
      }
    }

    // Schedule semanal
    let weekHtml=plan.weekSchedule.map((day,idx)=>{
      const isToday=idx===todayIdx;
      const bg=isToday?'rgba(255,139,159,.08)':'var(--ferreto-surface-2,rgba(255,255,255,.03))';
      const border=isToday?'1px solid rgba(255,139,159,.3)':'1px solid var(--ferreto-border,#30363d)';
      let dayTasks='';
      if(day.type==='descanso'){
        dayTasks=`<span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">😴 ${escHtml(day.tasks[0]||'Descanso')}</span>`;
      }else{
        dayTasks=(day.tasks||[]).map(t=>{
          if(typeof t==='string')return `<span style="color:var(--ferreto-text-muted,#8b949e);font-size:10px;">${escHtml(t)}</span>`;
          return `<span style="color:var(--ferreto-text,#e6edf3);font-size:10px;">${escHtml(t.course)} <span style="color:var(--ferreto-text-muted,#8b949e);">${fmtHours(t.hours||1)}</span></span>`;
        }).join(' · ');
      }
      return `<div style="background:${bg};border:${border};border-radius:8px;padding:8px 10px;margin-bottom:4px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <span style="color:${isToday?'var(--ferreto-primary,#ff8b9f)':'var(--ferreto-text,#e6edf3)'};font-size:11px;font-weight:600;">${escHtml(day.day)}${isToday?' (hoje)':''}</span>
        </div>
        <div>${dayTasks}</div>
      </div>`;
    }).join('');

    // Tips
    let tipsHtml=(plan.tips||[]).map(t=>`<div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;padding:4px 0;">${escHtml(t)}</div>`).join('');

    // Focus
    let focusHtml='';
    if(plan.focusSubjects&&plan.focusSubjects.length>0){
      focusHtml=plan.focusSubjects.map(f=>{
        const color=f.priority==='alta'?'#ff6b6b':'#fab005';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;">
          <span style="color:var(--ferreto-text,#e6edf3);font-size:11px;">${escHtml(f.name)}</span>
          <span style="color:${color};font-size:10px;font-weight:600;">${escHtml(f.priority)}</span>
        </div>`;
      }).join('');
    }

    // Days to exam badge
    let examBadge='';
    if(plan.daysToExam!=null){
      examBadge=`<div style="background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:600;display:inline-block;margin-bottom:10px;">⏰ ${plan.daysToExam} dias até a prova</div>`;
    }

    container.innerHTML=`
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0;font-size:15px;">🎯 Meu Plano de Estudo</h3>
          <button id="gdi-plan-edit" style="background:none;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:12px;">✏️ Editar</button>
        </div>
        ${examBadge}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;">
          <div style="font-size:11px;color:var(--ferreto-text,#e6edf3);font-weight:600;margin-bottom:8px;">📌 Tarefas de Hoje</div>
          ${todayHtml||'<span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">Sem tarefas</span>'}
        </div>
        <div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;">
          <div style="font-size:11px;color:var(--ferreto-text,#e6edf3);font-weight:600;margin-bottom:8px;">💪 Foco da Semana</div>
          ${focusHtml||'<span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">Adicione cursos para personalizar</span>'}
        </div>
      </div>

      <div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-size:11px;color:var(--ferreto-text,#e6edf3);font-weight:600;margin-bottom:8px;">📅 Cronograma Semanal</div>
        ${weekHtml}
      </div>

      <div style="background:linear-gradient(135deg,rgba(255,139,159,.06),rgba(192,38,211,.06));border:1px solid rgba(255,139,159,.2);border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-size:11px;color:var(--ferreto-text,#e6edf3);font-weight:600;margin-bottom:6px;">💡 Dicas</div>
        ${tipsHtml}
      </div>

      <div style="text-align:center;color:var(--ferreto-text-muted,#8b949e);font-size:10px;">
        Meta: ${escHtml(plan.goal||'concurso')} · ${fmtHours(plan.dailyHours||3)}/dia · ${plan.coursesCount||0} cursos · ${plan.totalLessons||0} aulas assistidas
      </div>
    `;

    const editBtn=container.querySelector('#gdi-plan-edit');
    if(editBtn)editBtn.onclick=()=>{
      renderSetup(container);
      // preencher com valores atuais
      if(savedPlan.goal)container.querySelector('#gdi-plan-goal').value=savedPlan.goal;
      if(savedPlan.examDate)container.querySelector('#gdi-plan-date').value=savedPlan.examDate;
      if(savedPlan.dailyHours){
        const h=container.querySelector('#gdi-plan-hours');
        h.value=savedPlan.dailyHours;
        container.querySelector('#gdi-plan-hours-label').textContent=fmtHours(savedPlan.dailyHours);
      }
    };
  }


  // ═══════════════════════════════════════════════════════════════
  // ★ v2.15.6: /plano com a Meggy — lista os planos do D1 (study_plans)
  //   e o formulário "Concurso Prova" (tipo + nome + banca + data +
  //   edital por URL, texto colado ou PDF com texto extraído no
  //   navegador). A Meggy gera o plano (POST /api/plans/generate) e ele
  //   é salvo nos dados do aluno. O plano semanal antigo (Drive) continua
  //   no link no fim da página (renderSetup/renderPlan intactos).
  // ═══════════════════════════════════════════════════════════════
  async function fetchD1Plans(){
    try{
      const r=await fetch('/api/plans/list',{credentials:'same-origin'});
      const d=await r.json();
      if(d&&d.ok&&Array.isArray(d.plans)) return d.plans;
    }catch(_){}
    return [];
  }

  function planOriginBadge(p){
    if(p.origin==='meggy-ai') return '<span style="display:inline-block;background:rgba(255,139,159,.15);border:1px solid rgba(255,139,159,.4);color:#ff8b9f;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:600;">🐩 Gerado pela Meggy</span>';
    return '<span style="display:inline-block;background:rgba(255,212,59,.1);border:1px solid rgba(255,212,59,.3);color:#ffd43b;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:600;">🎯 Determinístico</span>';
  }
  function planEditalBadge(p){
    const s=p.editalSource||'nenhum';
    // ★ v2.15.6-banca: o perfil da banca é cruzado SEMPRE que a banca é
    //   conhecida (com edital ou não) — o selo mostra as duas fontes.
    const perfil=(p.bancaProfile?' 📊 + perfil da banca '+escHtml(p.bancaProfile):'');
    // ★ merge v2.15.6-crossed: selo de cruzamento — mantém a fonte e o
    //   perfil do desenho vencedor e acrescenta o selo quando cruzado.
    const crossed=(p.crossed?' 🔀 Cruzado: edital + histórico da banca':'');
    // ★ v2.15.7 (item 12): "concurso apagado" — o plano sobreviveu sem o
    //   concurso (órfão); a lista avisa em vez de fingir que está tudo bem.
    const orphan=(p.orphaned?' · ⚠️ concurso apagado':'');
    if(s==='url') return '<span style="color:#5ddeda;font-size:11px;">📋 Edital: lido da URL'+perfil+crossed+orphan+'</span>';
    if(s==='texto') return '<span style="color:#5ddeda;font-size:11px;">📋 Edital: texto colado'+perfil+crossed+orphan+'</span>';
    if(s==='pdf') return '<span style="color:#5ddeda;font-size:11px;">📋 Edital: PDF enviado'+perfil+crossed+orphan+'</span>';
    // ★ v2.15.7 (item 11b): o build determinístico que usou as disciplinas
    //   do edital já analisadas agora registra editalSource='analisado'
    //   (antes: NULL → caía no "Sem edital" abaixo).
    if(s==='analisado') return '<span style="color:#5ddeda;font-size:11px;">📋 Edital: disciplinas já analisadas'+perfil+crossed+orphan+'</span>';
    if(s==='url-falha') return '<span style="color:#fab005;font-size:11px;">⚠️ Edital na URL não pôde ser lido — plano sem o edital'+perfil+crossed+orphan+'</span>';
    // ★ v2.15.7 (item 11b): este ramo descartava o `crossed` — o plano
    //   determinístico com disciplinas do edital aparecia como "Sem edital"
    //   na lista enquanto o modal mostrava "🔀 Cruzado". O selo agora
    //   acompanha o plano em TODOS os ramos (lista == modal), inclusive
    //   p/ planos antigos sem edital_source na coluna.
    return '<span style="color:#fab005;font-size:11px;">⚠️ Sem edital — baseado no que mais cai na banca'+crossed+orphan+'</span>';
  }

  async function extractEditalPdfText(file, onStatus){
    try{
      if(!window.gdiIsaPdf||typeof window.gdiIsaPdf.extractPdfText!=='function') return '';
      const url=URL.createObjectURL(file);
      try{
        const txt=await window.gdiIsaPdf.extractPdfText(url, function(ph){ if(onStatus) onStatus('Extraindo o texto do PDF do edital...'); });
        return String(txt||'');
      }finally{ try{ URL.revokeObjectURL(url); }catch(_){} }
    }catch(_){ return ''; }
  }

  function renderMeggyPlans(container, plans){
    // ★ v2.15.7 (item 12): guarda o container p/ o ouvinte de
    //   'gdi-plan-missing' (modal 404) poder re-ler a lista e podar o cartão.
    _lastPlanContainer=container;
    const fmtDate=function(ts){ try{ return new Date(ts).toLocaleDateString('pt-BR'); }catch(_){ return ''; } };
    let listHtml='';
    if(plans.length){
      listHtml=plans.map(function(p){
        return '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;margin-bottom:8px;">'
          + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;"><div><div style="color:var(--ferreto-text,#f0f6fc);font-size:13px;font-weight:600;">'+escHtml(p.name||'Plano')+'</div>'
          + '<div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-top:2px;">'+escHtml(p.banca||'')+(p.examDate?' · prova '+escHtml(p.examDate):'')+' · '+p.totalDays+' dias · '+p.dailyHours+'h/dia'+(p.createdAt?' · '+fmtDate(p.createdAt):'')+'</div>'
          + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;align-items:center;">'+planOriginBadge(p)+' '+planEditalBadge(p)+'</div></div>'
          + '<div style="display:flex;gap:6px;flex-shrink:0;"><button class="gdi-btn" data-plan-view="'+escHtml(p.id)+'" style="padding:6px 10px;font-size:12px;">📅 Ver plano</button>'
          + '<button class="gdi-btn" data-plan-redo="'+escHtml(p.id)+'" style="padding:6px 10px;font-size:12px;">🔄 Refazer</button>'
          + '<button class="gdi-btn" data-plan-delete="'+escHtml(p.id)+'" style="padding:6px 10px;font-size:12px;">🗑️ Excluir</button></div></div></div>';
      }).join('');
    } else {
      listHtml='<div style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;padding:8px 0 14px;">Você ainda não tem plano. Monte o primeiro com a Meggy abaixo.</div>';
    }
    const inputStyle='width:100%;box-sizing:border-box;background:var(--ferreto-surface,rgba(0,0,0,.3));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 12px;font-size:14px;';
    const labelStyle='display:block;color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:4px;';
    container.innerHTML=
      '<div style="margin-bottom:16px;">'
      + '<h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 4px;font-size:16px;">🐩 Plano de Estudo</h3>'
      + '<p style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin:0;">A Meggy lê o seu concurso e o último edital e monta o plano dia a dia — salvo nos seus dados.</p></div>'
      + '<div style="margin-bottom:18px;"><div style="font-size:12px;color:var(--ferreto-text,#e6edf3);font-weight:600;margin-bottom:8px;">📋 Meus planos</div>'+listHtml+'</div>'
      + '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:12px;padding:16px;">'
      + '<div style="font-size:13px;color:var(--ferreto-text,#e6edf3);font-weight:600;margin-bottom:4px;">🎯 Novo plano com a Meggy — Concurso Prova</div>'
      + '<p style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin:0 0 12px;">Escolha o tipo de concurso e adicione o concurso que você vai prestar. A Meggy busca o último edital e gera o plano.</p>'
      + '<div style="display:grid;gap:10px;max-width:520px;">'
      + '<div><label style="'+labelStyle+'">Tipo de concurso</label><select id="gdi-plan2-type" style="'+inputStyle+'"><option value="concurso">Concurso Público</option><option value="enem">ENEM</option><option value="vestibular">Vestibular</option><option value="oab">OAB</option><option value="outro">Outro</option></select></div>'
      + '<div><label style="'+labelStyle+'">Nome do concurso (ex.: PF 2026, TJSP Escrevente)</label><input id="gdi-plan2-name" type="text" placeholder="Ex.: Polícia Federal 2026" style="'+inputStyle+'"></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><label style="'+labelStyle+'">Banca organizadora</label><select id="gdi-plan2-banca" style="'+inputStyle+'"><option value="">Outra / não sei</option><option value="Cebraspe">Cebraspe</option><option value="FGV">FGV</option><option value="FCC">FCC</option><option value="Vunesp">Vunesp</option><option value="IBFC">IBFC</option></select></div>'
      + '<div><label style="'+labelStyle+'">Data da prova</label><input id="gdi-plan2-date" type="date" style="'+inputStyle+'"></div></div>'
      + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;"><div><label style="'+labelStyle+'">Horas por dia: <span id="gdi-plan2-hours-label" style="color:var(--ferreto-primary,#ff8b9f);">2h</span></label><input id="gdi-plan2-hours" type="range" min="1" max="8" step="0.5" value="2" style="width:100%;accent-color:var(--ferreto-primary,#ff8b9f);"></div>'
      + '<div><label style="'+labelStyle+'">Dias de plano (vazio = até a prova)</label><input id="gdi-plan2-days" type="number" min="7" max="180" placeholder="60" style="'+inputStyle+'"></div></div>'
      + '<div><label style="'+labelStyle+'">URL do edital (a Meggy lê a página pública)</label><input id="gdi-plan2-edital-url" type="url" placeholder="https://.../edital" style="'+inputStyle+'"></div>'
      + '<div><label style="'+labelStyle+'">Ou cole o texto do edital</label><textarea id="gdi-plan2-edital-text" rows="3" placeholder="Cole aqui o conteúdo programático do edital..." style="'+inputStyle+'"></textarea></div>'
      + '<div><label style="'+labelStyle+'">Ou envie o PDF do edital (o texto é extraído no seu navegador)</label><input id="gdi-plan2-edital-pdf" type="file" accept="application/pdf,.pdf" style="width:100%;color:var(--ferreto-text-muted,#8b949e);font-size:12px;"><div id="gdi-plan2-pdf-status" style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-top:4px;"></div></div>'
      + '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);">A Meggy cruza o edital com o que mais cai na banca (perfil semeado) — o histórico da banca entra sempre no plano. Sem edital, usa só o histórico da banca. Para PDF na URL, baixe o arquivo e envie-o aqui.</div>'
      + '<div id="gdi-plan2-msg" style="font-size:12px;min-height:16px;"></div>'
      + '<button id="gdi-plan2-generate" class="gdi-btn gdi-btn-primary" style="width:100%;font-size:14px;">🐩 Gerar plano com a Meggy</button>'
      + '</div></div>'
      + '<div style="text-align:center;margin-top:14px;"><button id="gdi-plan2-legacy" style="background:none;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:12px;text-decoration:underline;">Plano semanal antigo (Drive)</button></div>';
    const q=function(s){ return container.querySelector(s); };
    const hours=q('#gdi-plan2-hours'), hoursLabel=q('#gdi-plan2-hours-label');
    if(hours&&hoursLabel) hours.oninput=function(){ hoursLabel.textContent=fmtHours(parseFloat(hours.value)); };
    const pdfInput=q('#gdi-plan2-edital-pdf');
    if(pdfInput) pdfInput.onchange=function(){
      const st=q('#gdi-plan2-pdf-status');
      if(st) st.textContent=pdfInput.files&&pdfInput.files[0]?('Arquivo: '+pdfInput.files[0].name+' — o texto será extraído ao gerar o plano.'):'';
    };
    const btn=q('#gdi-plan2-generate');
    if(btn) btn.onclick=function(){ generateMeggyPlan(container); };
    const legacy=q('#gdi-plan2-legacy');
    if(legacy) legacy.onclick=function(){ renderSetup(container); };
    container.querySelectorAll('[data-plan-view]').forEach(function(b){
      b.onclick=function(){
        if(window.Shell&&Shell.views&&typeof Shell.views.showPlanModal==='function') Shell.views.showPlanModal(b.getAttribute('data-plan-view'));
      };
    });
    container.querySelectorAll('[data-plan-redo]').forEach(function(b){
      b.onclick=function(){
        const p=(plans||[]).find(function(x){ return x.id===b.getAttribute('data-plan-redo'); });
        if(!p) return;
        if(q('#gdi-plan2-name')) q('#gdi-plan2-name').value=p.name||'';
        if(q('#gdi-plan2-banca')) q('#gdi-plan2-banca').value=p.banca||'';
        if(q('#gdi-plan2-date')) q('#gdi-plan2-date').value=p.examDate||'';
        if(q('#gdi-plan2-hours')){ q('#gdi-plan2-hours').value=p.dailyHours||2; if(hoursLabel) hoursLabel.textContent=fmtHours(p.dailyHours||2); }
        if(q('#gdi-plan2-days')) q('#gdi-plan2-days').value=p.totalDays||'';
        const form=q('#gdi-plan2-generate');
        if(form) form.scrollIntoView({behavior:'smooth',block:'center'});
      };
    });
    // ★ v2.15.7 (item 12): excluir plano — confirmação em 2 toques (sem
    //   confirm() nativo: é auto-dispensado em navegadores móveis) e
    //   DELETE /api/plans/:id; depois a lista é re-lida (o cartão some).
    container.querySelectorAll('[data-plan-delete]').forEach(function(b){
      b.onclick=async function(){
        if(b.getAttribute('data-confirm')!=='1'){
          b.setAttribute('data-confirm','1');
          b.textContent='Confirmar exclusão?';
          // ★ v2.15.9 (D): sem expiração — o armado fica até o 2º toque
          //   confirmar, a lista re-renderizar (troca de aba / re-leitura)
          //   ou o erro resetar o botão. O setTimeout de 5 s expirava o
          //   confirmar no meio do 2º toque (o teste precisou de 2 cliques
          //   em sequência rápida); a confirmação em 2 toques continua.
          return;
        }
        b.disabled=true; b.textContent='Excluindo...';
        try{
          const r=await fetch('/api/plans/'+encodeURIComponent(b.getAttribute('data-plan-delete')),{method:'DELETE',credentials:'same-origin'});
          const d=await r.json();
          if(!d||!d.ok) throw new Error((d&&d.error)||('HTTP '+r.status));
          const plans=await fetchD1Plans();
          renderMeggyPlans(container, plans);
          const m=q('#gdi-plan2-msg'); if(m){ m.style.color='#9aa4b8'; m.textContent='🗑️ Plano excluído.'; }
        }catch(e){
          b.disabled=false; b.removeAttribute('data-confirm'); b.textContent='🗑️ Excluir';
          const m=q('#gdi-plan2-msg'); if(m){ m.style.color='#ff6b6b'; m.textContent='Não foi possível excluir o plano: '+(e.message||e); }
        }
      };
    });
  }

  async function generateMeggyPlan(container){
    const q=function(s){ return container.querySelector(s); };
    const btn=q('#gdi-plan2-generate');
    // ★ merge v2.15.6-crossed (bug achado pelos testes H): a mensagem era
    //   guardada num nó capturado antes do re-render — renderMeggyPlans
    //   recria o DOM e o sucesso sumia. Agora showMsg re-consulta
    //   #gdi-plan2-msg a cada uso (o nó novo, depois do re-render).
    const showMsg=function(t,err){ const m=q('#gdi-plan2-msg'); if(m){ m.style.color=err?'#ff6b6b':'#9aa4b8'; m.textContent=t; } };
    // ★ v2.15.6-banca: ler os campos do form DENTRO do try — antes, um
    //   campo ausente quebrava o clique em silêncio (o botão não fazia
    //   nada e nenhum erro aparecia).
    try{
      if(!btn) throw new Error('formulário não carregado — recarregue a página');
      const type=q('#gdi-plan2-type').value;
    const name=q('#gdi-plan2-name').value.trim();
    const banca=q('#gdi-plan2-banca').value;
    const examDate=q('#gdi-plan2-date').value;
    const dailyHours=parseFloat(q('#gdi-plan2-hours').value)||2;
    let totalDays=parseInt(q('#gdi-plan2-days').value,10);
    if(!totalDays&&examDate){ const d=new Date(examDate+'T12:00:00'); if(!isNaN(d.getTime())) totalDays=Math.ceil((d.getTime()-Date.now())/86400000); }
    if(!totalDays||totalDays<7) totalDays=60;
    if(totalDays>180) totalDays=180;
    const editalUrl=q('#gdi-plan2-edital-url').value.trim();
    let editalText=q('#gdi-plan2-edital-text').value.trim();
    let editalSource=null;
    const pdfFile=q('#gdi-plan2-edital-pdf').files&&q('#gdi-plan2-edital-pdf').files[0];
      btn.disabled=true; btn.textContent='🐩 A Meggy está lendo o edital e montando o plano...';
      if(pdfFile&&!editalText){
        showMsg('Extraindo o texto do PDF do edital...');
        const pdfText=await extractEditalPdfText(pdfFile, function(s){ showMsg(s); });
        if(pdfText&&pdfText.length>=200){ editalText=pdfText; editalSource='pdf'; }
        else showMsg('O PDF não trouxe texto suficiente — cole o texto do edital ou informe a URL.', true);
      }
      if(!editalUrl&&!editalText&&!banca){
        showMsg('Informe a banca ou o edital (URL, texto ou PDF) para a Meggy montar o plano.', true);
        btn.disabled=false; btn.textContent='🐩 Gerar plano com a Meggy'; return;
      }
      const r=await fetch('/api/plans/generate',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({concursoType:type,name:name,banca:banca,examDate:examDate,dailyHours:dailyHours,totalDays:totalDays,edital:{url:editalUrl||undefined,text:editalText||undefined,source:editalSource||undefined}})});
      const d=await r.json();
      if(!d||!d.ok) throw new Error((d&&d.error)||('HTTP '+r.status));
      const plans=await fetchD1Plans();
      renderMeggyPlans(container, plans);
      showMsg((d.fallback?'⚠️ A IA estava indisponível — plano determinístico montado. ':'🐩 Plano gerado pela Meggy! ')+(d.editalNote||''));
      if(window.Shell&&Shell.views&&typeof Shell.views.showPlanModal==='function'&&d.planId) Shell.views.showPlanModal(d.planId);
    }catch(e){
      showMsg('Não foi possível gerar o plano: '+(e.message||e), true);
      if(btn){ btn.disabled=false; btn.textContent='🐩 Gerar plano com a Meggy'; }
    }
  }

  async function renderAll(container){
    if(!container)return;
    container.innerHTML='<div style="text-align:center;padding:20px;"><div class="gdi-mat-isa-spin" style="margin:0 auto;"></div></div>';
    const plans=await fetchD1Plans();
    renderMeggyPlans(container, plans);
  }


  // ── Namespace exposure ──
  // ★ v2.15.7 (item 12): o modal (shell.js) avisa quando o plano aberto
  //   não existe mais (lista desatualizada — ex.: o concurso foi apagado e
  //   os planos foram junto em cascata). A lista é re-lida e o cartão some.
  let _lastPlanContainer=null;
  if(typeof window!=='undefined'&&window.addEventListener&&!window.__gdiPlanMissingWired){
    window.__gdiPlanMissingWired=true;
    window.addEventListener('gdi-plan-missing', async function(){
      try{
        if(!_lastPlanContainer||!_lastPlanContainer.isConnected) return;
        const plans=await fetchD1Plans();
        renderMeggyPlans(_lastPlanContainer, plans);
      }catch(_){}
    });
  }

  window.__gdiStudy = window.__gdiStudy || {};
  window.__gdiStudy.plan = {
    renderAll: renderAll,
    renderSetup: renderSetup,
    renderPlan: renderPlan,
    generatePlan: generatePlan,
    savePlan: savePlan,
    fetchPlan: fetchPlan,
    renderMeggyPlans: renderMeggyPlans,
    generateMeggyPlan: generateMeggyPlan,
    fetchD1Plans: fetchD1Plans
  };

  console.log('[GDI Study Plan] v1.0.139 — plano de estudo adaptativo ativo');
})();
