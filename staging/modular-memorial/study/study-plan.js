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
    if(plan.daysToExam!==null){
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

  async function renderAll(container){
    if(!container)return;
    container.innerHTML='<div style="text-align:center;padding:20px;"><div class="gdi-mat-isa-spin" style="margin:0 auto;"></div></div>';
    const savedPlan=await fetchPlan();
    if(savedPlan&&savedPlan.plan){
      renderPlan(container, savedPlan);
    }else{
      renderSetup(container);
    }
  }

  // ── Namespace exposure ──
  window.__gdiStudy = window.__gdiStudy || {};
  window.__gdiStudy.plan = {
    renderAll: renderAll,
    renderSetup: renderSetup,
    renderPlan: renderPlan,
    generatePlan: generatePlan,
    savePlan: savePlan,
    fetchPlan: fetchPlan
  };

  console.log('[GDI Study Plan] v1.0.139 — plano de estudo adaptativo ativo');
})();
