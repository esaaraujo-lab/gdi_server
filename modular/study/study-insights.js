// ═══════════════════════════════════════════════════════════════
// study-insights.js — Dashboard de progresso + Meggy Coach (v1.0.118)
//
// O "killer feature": IA que realmente entende o aluno.
// - Dashboard: minutos/dia, streak, heatmap (GitHub-style), matérias
// - Meggy Coach: analisa seus dados e dá recomendações personalizadas
//
// Endpoints:
//   GET  /api/analytics/summary — analytics (matemática, sem IA)
//   POST /api/ai/coach          — IA analisa seus dados e recomenda
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // Cache simples (evita re-fetch a cada renderHome)
  let _analyticsCache=null, _analyticsCacheAt=0;
  let _coachCache=null, _coachCacheAt=0;
  const ANALYTICS_TTL=60000;  // 1 min
  const COACH_TTL=300000;     // 5 min (IA é cara — cache maior)

  // Helpers de UI
  function escHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function escAttr(s){return escHtml(s);}

  // Formata minutos como "Xh Ymin"
  function fmtMin(m){
    m=Math.max(0,Math.round(m||0));
    if(m<60)return m+'min';
    const h=Math.floor(m/60), mm=m%60;
    return mm===0?h+'h':h+'h '+mm+'min';
  }

  // Formata timestamp relativo ("há 2h", "ontem", "3 dias atrás")
  function fmtRelative(ts){
    if(!ts)return 'nunca';
    const diff=Date.now()-ts;
    const min=Math.floor(diff/60000);
    if(min<1)return 'agora';
    if(min<60)return 'há '+min+'min';
    const h=Math.floor(min/60);
    if(h<24)return 'há '+h+'h';
    const d=Math.floor(h/24);
    if(d===1)return 'ontem';
    if(d<7)return 'há '+d+' dias';
    return new Date(ts).toLocaleDateString('pt-BR');
  }

  // ═══ Fetchers ═══
  async function fetchAnalytics(){
    // cache hit?
    if(_analyticsCache && (Date.now()-_analyticsCacheAt)<ANALYTICS_TTL){
      return _analyticsCache;
    }
    try{
      const r=await fetch('/api/analytics/summary',{credentials:'same-origin'});
      if(!r.ok)return null;
      const d=await r.json();
      if(!d||!d.ok)return null;
      _analyticsCache=d;
      _analyticsCacheAt=Date.now();
      return d;
    }catch(_){return null;}
  }

  async function fetchCoach(force){
    if(!force && _coachCache && (Date.now()-_coachCacheAt)<COACH_TTL){
      return _coachCache;
    }
    try{
      const r=await fetch('/api/ai/coach',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'same-origin',
        body:JSON.stringify({})
      });
      if(!r.ok){
        if(r.status===429)return {ok:false,error:'rate_limit'};
        return null;
      }
      const d=await r.json();
      if(!d||!d.ok)return null;
      _coachCache=d;
      _coachCacheAt=Date.now();
      return d;
    }catch(_){return null;}
  }

  function invalidateCache(){
    _analyticsCache=null;_analyticsCacheAt=0;
    _coachCache=null;_coachCacheAt=0;
  }

  // ═══ Render: Dashboard de Analytics ═══
  function renderDashboard(container, data){
    if(!data||!data.ok||!data.analytics){
      container.innerHTML='<div style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;padding:12px;">Carregando analytics…</div>';
      return;
    }
    const a=data.analytics;
    const goalPct=a.goalProgress||0;
    const goalColor=goalPct>=100?'#2f9e44':goalPct>=50?'#fab005':'#ff6b6b';

    // Heatmap HTML (últimas 12 semanas = 84 dias, estilo GitHub)
    let heatmapHtml='<div style="display:flex;gap:2px;flex-wrap:wrap;margin-top:8px;">';
    const days=Object.keys(a.heatmap||{}).sort().reverse().slice(0,84).reverse();
    for(const day of days){
      const count=(a.heatmap&&a.heatmap[day])||0;
      const intensity=count===0?0:Math.min(4,Math.ceil(count/2));
      const colors=['#161b22','#0e4429','#006d32','#26a641','#39d353'];
      const bg=colors[intensity];
      const dateLabel=new Date(day+'T00:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'});
      heatmapHtml+='<div title="'+escAttr(dateLabel)+': '+count+' aula(s)" style="width:11px;height:11px;border-radius:2px;background:'+bg+';"></div>';
    }
    heatmapHtml+='</div>';

    // Subjects (top 5)
    let subjectsHtml='';
    const subjects=(a.subjects||[]).slice(0,5);
    if(subjects.length===0){
      subjectsHtml='<span style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;">Nenhuma aula assistida ainda</span>';
    }else{
      const maxWatched=Math.max(...subjects.map(s=>s.watched||0),1);
      subjectsHtml=subjects.map(s=>{
        const pct=Math.round((s.watched/maxWatched)*100);
        return '<div style="margin-bottom:6px;">'+
          '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px;">'+
          '<span style="color:var(--ferreto-text,#e6edf3);">'+escHtml(s.name)+'</span>'+
          '<span style="color:var(--ferreto-text-muted,#8b949e);">'+s.watched+' aulas</span>'+
          '</div>'+
          '<div style="height:4px;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border-radius:2px;overflow:hidden;">'+
          '<div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,#ff8b9f,#c026d3);border-radius:2px;"></div>'+
          '</div></div>';
      }).join('');
    }

    container.innerHTML=
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px;">'+
        // Card: Hoje
        '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;">'+
        '<div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.5px;">Hoje</div>'+
        '<div style="font-size:22px;font-weight:700;color:var(--ferreto-text,#f0f6fc);margin-top:2px;">'+fmtMin(a.todayMinutes)+'</div>'+
        '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-top:2px;">'+(a.watchedToday||0)+' aula(s)</div>'+
        '</div>'+
        // Card: Semana
        '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;">'+
        '<div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.5px;">Semana</div>'+
        '<div style="font-size:22px;font-weight:700;color:var(--ferreto-text,#f0f6fc);margin-top:2px;">'+fmtMin(a.weekMinutes)+'</div>'+
        '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-top:2px;">'+(a.watchedThisWeek||0)+' aulas</div>'+
        '</div>'+
        // Card: Streak
        '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;">'+
        '<div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.5px;">Streak 🔥</div>'+
        '<div style="font-size:22px;font-weight:700;color:'+(a.streak>0?'#ff8b9f':'var(--ferreto-text-muted,#8b949e)')+';margin-top:2px;">'+(a.streak||0)+' dias</div>'+
        '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-top:2px;">Melhor: '+(a.bestStreak||0)+'</div>'+
        '</div>'+
        // Card: SRS
        '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;">'+
        '<div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);text-transform:uppercase;letter-spacing:.5px;">Flashcards</div>'+
        '<div style="font-size:22px;font-weight:700;color:'+(a.srsDue>0?'#fab005':'var(--ferreto-text,#f0f6fc)')+';margin-top:2px;">'+(a.srsDue||0)+'</div>'+
        '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);margin-top:2px;">vencidos de '+(a.srsTotal||0)+'</div>'+
        '</div>'+
      '</div>'+

      // Meta do dia
      '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;margin-bottom:14px;">'+
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'+
        '<span style="font-size:12px;color:var(--ferreto-text,#e6edf3);font-weight:600;">📊 Meta diária</span>'+
        '<span style="font-size:12px;color:'+goalColor+';font-weight:700;">'+goalPct+'%</span>'+
        '</div>'+
        '<div style="height:8px;background:var(--ferreto-surface,rgba(0,0,0,.3));border-radius:4px;overflow:hidden;">'+
        '<div style="height:100%;width:'+Math.min(100,goalPct)+'%;background:'+goalColor+';border-radius:4px;transition:width .5s ease;"></div>'+
        '</div>'+
        '<div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);margin-top:4px;">'+fmtMin(a.todayMinutes)+' de '+fmtMin(a.goalMinutes)+' — '+(goalPct>=100?'Meta batida! 🎉':'falta '+fmtMin(Math.max(0,a.goalMinutes-a.todayMinutes)))+'</div>'+
      '</div>'+

      // Grid: Heatmap + Subjects
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">'+
        // Heatmap
        '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;">'+
        '<div style="font-size:11px;color:var(--ferreto-text,#e6edf3);font-weight:600;margin-bottom:4px;">📅 Atividade (90 dias)</div>'+
        heatmapHtml+
        '<div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);margin-top:6px;">Última atividade: '+fmtRelative(a.lastActivity)+'</div>'+
        '</div>'+
        // Subjects
        '<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:10px;padding:12px;">'+
        '<div style="font-size:11px;color:var(--ferreto-text,#e6edf3);font-weight:600;margin-bottom:8px;">📚 Matérias</div>'+
        subjectsHtml+
        '</div>'+
      '</div>';
  }

  // ═══ Render: Meggy Coach ═══
  function renderCoach(container, data, loading){
    if(loading){
      container.innerHTML=
        '<div style="background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(192,38,211,.08));border:1px solid rgba(255,139,159,.3);border-radius:12px;padding:16px;">'+
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'+
        '<div style="font-size:24px;">🐩</div>'+
        '<div><div style="font-size:14px;font-weight:700;color:var(--ferreto-text,#f0f6fc);">Meggy Coach</div>'+
        '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);">Analisando seus dados…</div></div>'+
        '</div>'+
        '<div style="text-align:center;padding:16px;"><div class="gdi-mat-isa-spin" style="margin:0 auto;"></div></div>'+
        '</div>';
      return;
    }
    if(!data){
      container.innerHTML=
        '<div style="background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(192,38,211,.08));border:1px solid rgba(255,139,159,.3);border-radius:12px;padding:16px;">'+
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'+
        '<div style="font-size:24px;">🐩</div>'+
        '<div><div style="font-size:14px;font-weight:700;color:var(--ferreto-text,#f0f6fc);">Meggy Coach</div>'+
        '<div style="font-size:11px;color:var(--ferreto-text-muted,#8b949e);">Análise personalizada com IA</div></div>'+
        '</div>'+
        '<div style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;margin-bottom:10px;">A Meggy vai analisar seu padrão de estudo e dar recomendações específicas.</div>'+
        '<button id="gdi-coach-trigger" class="gdi-btn gdi-btn-primary" style="font-size:12px;width:100%;">'+
        '<i class="bi bi-stars"></i> Analisar meus estudos</button>'+
        '</div>';
      const btn=container.querySelector('#gdi-coach-trigger');
      if(btn)btn.onclick=async()=>{
        btn.disabled=true;
        btn.innerHTML='<div class="gdi-mat-isa-spin" style="width:14px;height:14px;display:inline-block;"></div> Analisando…';
        const d=await fetchCoach(true);
        renderCoach(container,d,false);
      };
      return;
    }
    if(!data.ok){
      const msg=data.error==='rate_limit'
        ?'Você atingiu o limite de 10 análises por hora. Tente novamente mais tarde.'
        :'A Meggy não conseguiu analisar agora. Tente novamente em alguns instantes.';
      container.innerHTML=
        '<div style="background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(192,38,211,.08));border:1px solid rgba(255,139,159,.3);border-radius:12px;padding:16px;">'+
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'+
        '<div style="font-size:24px;">🐩</div>'+
        '<div style="font-size:14px;font-weight:700;color:var(--ferreto-text,#f0f6fc);">Meggy Coach</div>'+
        '</div>'+
        '<div style="color:#ff8b8b;font-size:12px;margin-bottom:10px;">'+escHtml(msg)+'</div>'+
        '<button id="gdi-coach-retry" class="gdi-btn gdi-btn-ghost" style="font-size:12px;">Tentar novamente</button>'+
        '</div>';
      const btn=container.querySelector('#gdi-coach-retry');
      if(btn)btn.onclick=()=>{renderCoach(container,null,false);};
      return;
    }

    // Sucesso — renderiza a resposta em Markdown simples
    const md=String(data.response||'');
    // Markdown muito simples: ## → h2, ** → bold, listas com -
    let html=escHtml(md)
      .replace(/^## (.+)$/gm,'<h3 style="color:var(--ferreto-text,#f0f6fc);font-size:13px;font-weight:700;margin:12px 0 6px;">$1</h3>')
      .replace(/^### (.+)$/gm,'<h4 style="color:var(--ferreto-text,#e6edf3);font-size:12px;font-weight:600;margin:10px 0 4px;">$1</h4>')
      .replace(/\*\*(.+?)\*\*/g,'<strong style="color:var(--ferreto-text,#f0f6fc);">$1</strong>')
      .replace(/^- (.+)$/gm,'<div style="padding-left:14px;position:relative;margin:3px 0;color:var(--ferreto-text,#e6edf3);font-size:12px;"><span style="position:absolute;left:0;color:var(--ferreto-primary,#ff8b9f);">•</span>$1</div>')
      .replace(/\n\n/g,'<div style="height:6px;"></div>');

    // Context badge
    const ctx=data.context||{};
    const ctxBadge=ctx.watchedThisWeek!==undefined?
      '<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:10px;color:var(--ferreto-text-muted,#8b949e);margin-top:8px;">'+
      '<span>📊 '+ctx.watchedThisWeek+' aulas/semana</span>'+
      '<span>🔥 '+ctx.streak+' dias</span>'+
      (ctx.srsDue>0?'<span style="color:#fab005;">⚠ '+ctx.srsDue+' flashcards vencidos</span>':'')+
      '<span>🤖 '+escHtml(data.provider||'')+'</span>'+
      '</div>':'';

    container.innerHTML=
      '<div style="background:linear-gradient(135deg,rgba(255,139,159,.08),rgba(192,38,211,.08));border:1px solid rgba(255,139,159,.3);border-radius:12px;padding:16px;">'+
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'+
      '<div style="font-size:24px;">🐩</div>'+
      '<div style="flex:1;">'+
      '<div style="font-size:14px;font-weight:700;color:var(--ferreto-text,#f0f6fc);">Meggy Coach</div>'+
      '<div style="font-size:10px;color:var(--ferreto-text-muted,#8b949e);">Análise personalizada · '+fmtRelative(_coachCacheAt)+'</div>'+
      '</div>'+
      '<button id="gdi-coach-refresh" title="Atualizar" style="background:none;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:14px;padding:4px;">'+
      '<i class="bi bi-arrow-clockwise"></i></button>'+
      '</div>'+
      '<div style="color:var(--ferreto-text,#e6edf3);font-size:12px;line-height:1.6;">'+html+'</div>'+
      ctxBadge+
      '</div>';

    const refresh=container.querySelector('#gdi-coach-refresh');
    if(refresh)refresh.onclick=async()=>{
      renderCoach(container,null,true);
      const d=await fetchCoach(true);
      renderCoach(container,d,false);
    };
  }

  // ═══ Render: container completo (dashboard + coach) ═══
  async function renderAll(container){
    if(!container)return;

    // Estrutura: dashboard no topo, coach embaixo
    container.innerHTML=
      '<div id="gdi-insights-dashboard" style="margin-bottom:14px;"></div>'+
      '<div id="gdi-insights-coach"></div>';

    const dashEl=container.querySelector('#gdi-insights-dashboard');
    const coachEl=container.querySelector('#gdi-insights-coach');

    // Dashboard (rápido — sem IA)
    renderDashboard(dashEl,null);
    const analytics=await fetchAnalytics();
    renderDashboard(dashEl,analytics);

    // Coach (usa cache se tiver; se não, mostra botão "Analisar")
    if(_coachCache && _coachCache.ok){
      renderCoach(coachEl,_coachCache,false);
    }else{
      renderCoach(coachEl,null,false);
    }
  }

  // ═══ Namespace exposure ═══
  window.__gdiStudy = window.__gdiStudy || {};
  window.__gdiStudy.insights = {
    renderAll: renderAll,
    renderDashboard: renderDashboard,
    renderCoach: renderCoach,
    fetchAnalytics: fetchAnalytics,
    fetchCoach: fetchCoach,
    invalidateCache: invalidateCache
  };

  // Invalida cache quando cursos mudam
  try{
    if(typeof Bus!=='undefined' && Bus && typeof Bus.on==='function'){
      Bus.on('courses:changed',()=>{ invalidateCache(); });
    }
  }catch(_){}

  console.log('[GDI Insights] v1.0.118 — Dashboard + Meggy Coach ativo');
})();
