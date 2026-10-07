// ═══════════════════════════════════════════════════════════════
// study-notifications.js — v1.0.140
// 1. Notificações in-app: lembretes de estudo + flashcards vencidos
// 2. Busca nas notas/anotações do aluno
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  function escHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  // ═══ 1. NOTIFICAÇÕES IN-APP ═══
  // Mostra badges/lembretes quando o aluno abre a Área do Aluno:
  // - Flashcards vencidos
  // - Não estudou hoje (streak em risco)
  // - Nova meta do plano

  let _notifBar=null;

  async function checkAndShowNotifications(){
    try{
      const r=await fetch('/api/analytics/summary',{credentials:'same-origin'});
      if(!r.ok)return;
      const d=await r.json();
      if(!d||!d.ok||!d.analytics)return;

      const a=d.analytics;
      const notifs=[];

      // Flashcards vencidos
      if(a.srsDue>0){
        notifs.push({
          icon:'🃏',
          text:`${a.srsDue} flashcard(s) vencido(s) para revisar`,
          action:'flashcards',
          priority:'high'
        });
      }

      // Streak em risco (não estudou hoje mas tem streak)
      if(a.watchedToday===0 && a.streak>0){
        notifs.push({
          icon:'🔥',
          text:`Seu streak de ${a.streak} dias está em risco! Estude hoje.`,
          action:'study',
          priority:'high'
        });
      }

      // Meta não atingida
      if(a.goalProgress<100 && a.watchedToday>0){
        notifs.push({
          icon:'📊',
          text:`Faltam ${Math.max(0,Math.round((a.goalMinutes-a.todayMinutes)))}min para sua meta diária`,
          action:'goal',
          priority:'medium'
        });
      }

      // Sem atividade na semana
      if(a.watchedThisWeek===0 && a.watchedToday===0){
        notifs.push({
          icon:'📚',
          text:'Você ainda não estudou esta semana. Que tal começar agora?',
          action:'study',
          priority:'medium'
        });
      }

      renderNotifBar(notifs);
    }catch(_){}
  }

  function renderNotifBar(notifs){
    // Remove barra anterior
    if(_notifBar){_notifBar.remove();_notifBar=null;}
    if(notifs.length===0)return;

    const bar=document.createElement('div');
    bar.id='gdi-notif-bar';
    bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9998;display:flex;flex-direction:column;gap:4px;padding:8px 12px;background:rgba(13,15,20,.95);backdrop-filter:blur(10px);border-bottom:1px solid var(--ferreto-border,#30363d);';

    notifs.forEach(n=>{
      const item=document.createElement('div');
      item.style.cssText='display:flex;align-items:center;gap:10px;padding:6px 10px;border-radius:8px;cursor:pointer;transition:background .15s;'+
        (n.priority==='high'?'background:rgba(255,107,107,.1);border:1px solid rgba(255,107,107,.3);':'background:rgba(250,176,5,.08);border:1px solid rgba(250,176,5,.2);');
      item.innerHTML=`<span style="font-size:16px;">${n.icon}</span><span style="color:var(--ferreto-text,#e6edf3);font-size:12px;flex:1;">${escHtml(n.text)}</span><i class="bi bi-chevron-right" style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;"></i>`;
      item.onmouseenter=()=>{item.style.filter='brightness(1.2)';};
      item.onmouseleave=()=>{item.style.filter='';};
      item.onclick=()=>{
        // Fecha a barra e executa ação
        bar.remove();_notifBar=null;
        handleNotifAction(n.action);
      };
      bar.appendChild(item);
    });

    // Botão fechar
    const closeBtn=document.createElement('button');
    closeBtn.innerHTML='✕';
    closeBtn.style.cssText='position:absolute;top:4px;right:8px;background:none;border:0;color:var(--ferreto-text-muted,#8b949e);cursor:pointer;font-size:14px;padding:4px;';
    closeBtn.onclick=()=>{bar.remove();_notifBar=null;};
    bar.appendChild(closeBtn);

    document.body.appendChild(bar);
    _notifBar=bar;

    // Auto-hide após 15s
    setTimeout(()=>{if(_notifBar){_notifBar.remove();_notifBar=null;}},15000);
  }

  function handleNotifAction(action){
    try{
      if(action==='flashcards'){
        // Vai pra aba de questões/flashcards
        const tab=document.querySelector('.gdi-central-tab[data-t="questoes"]');
        if(tab)tab.click();
      }else if(action==='study'||action==='goal'){
        // Vai pra aba início
        const tab=document.querySelector('.gdi-central-tab[data-t="home"]');
        if(tab)tab.click();
      }
    }catch(_){}
  }

  // ═══ 2. BUSCA NAS NOTAS ═══
  // Busca nas anotações do aluno (state.notes) por keyword.
  // As notas estão no GDIUser (client-side), não precisa de endpoint.

  function searchNotes(query){
    if(!query||!query.trim())return [];
    const q=query.toLowerCase().trim();
    const results=[];

    try{
      if(!window.GDIUser||typeof window.GDIUser.dump!=='function')return [];
      const dump=window.GDIUser.dump();
      if(!dump||!dump.notes)return [];

      for(const [path,notes] of Object.entries(dump.notes)){
        if(!Array.isArray(notes))continue;
        for(const note of notes){
          if(!note||!note.text)continue;
          if(note.text.toLowerCase().includes(q)){
            // Extrai nome da aula do path
            const segs=path.split('/').filter(Boolean);
            let lessonName=segs.length>0?segs[segs.length-1]:path;
            try{lessonName=decodeURIComponent(lessonName);}catch(_){}
            results.push({
              path,
              lessonName,
              text:note.text,
              time:note.t,
              snippet:getSnippet(note.text,q)
            });
          }
        }
      }
    }catch(_){}

    return results.sort((a,b)=>(b.time||0)-(a.time||0));
  }

  function getSnippet(text,q){
    const idx=text.toLowerCase().indexOf(q);
    if(idx<0)return text.substring(0,100);
    const start=Math.max(0,idx-40);
    const end=Math.min(text.length,idx+q.length+60);
    return (start>0?'…':'')+text.substring(start,end)+(end<text.length?'…':'');
  }

  function renderSearchUI(container){
    container.innerHTML=`
      <div style="margin-bottom:16px;">
        <h3 style="color:var(--ferreto-text,#f0f6fc);margin:0 0 10px;font-size:15px;">🔍 Buscar nas suas notas</h3>
        <div style="display:flex;gap:8px;">
          <input id="gdi-notes-search" type="text" placeholder="Digite uma palavra ou frase..." style="flex:1;background:var(--ferreto-surface-2,rgba(255,255,255,.06));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;color:var(--ferreto-text,#e6edf3);padding:10px 14px;font-size:14px;">
          <button id="gdi-notes-search-btn" class="gdi-btn gdi-btn-primary" style="font-size:13px;"><i class="bi bi-search"></i></button>
        </div>
      </div>
      <div id="gdi-notes-results"></div>
    `;

    const input=container.querySelector('#gdi-notes-search');
    const btn=container.querySelector('#gdi-notes-search-btn');
    const results=container.querySelector('#gdi-notes-results');

    function doSearch(){
      const q=input.value;
      if(!q.trim()){
        results.innerHTML='<div style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;padding:20px;text-align:center;">Digite algo para buscar nas suas anotações.</div>';
        return;
      }
      const found=searchNotes(q);
      if(found.length===0){
        results.innerHTML='<div style="color:var(--ferreto-text-muted,#8b949e);font-size:12px;padding:20px;text-align:center;">Nenhuma nota encontrada para "'+escHtml(q)+'"</div>';
        return;
      }
      results.innerHTML='<div style="color:var(--ferreto-text-muted,#8b949e);font-size:11px;margin-bottom:10px;">'+found.length+' resultado(s)</div>'+
        found.map(r=>{
          const timeStr=r.time?new Date(r.time).toLocaleDateString('pt-BR'):'';
          return `<div style="background:var(--ferreto-surface-2,rgba(255,255,255,.04));border:1px solid var(--ferreto-border,#30363d);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;" onclick="window.location.href='${escHtml(r.path)}'">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
              <span style="color:var(--ferreto-text,#f0f6fc);font-size:12px;font-weight:600;">${escHtml(r.lessonName)}</span>
              <span style="color:var(--ferreto-text-muted,#8b949e);font-size:10px;">${timeStr}</span>
            </div>
            <div style="color:var(--ferreto-text,#e6edf3);font-size:11px;line-height:1.5;">${escHtml(r.snippet)}</div>
          </div>`;
        }).join('');
    }

    if(btn)btn.onclick=doSearch;
    if(input)input.onkeydown=(e)=>{if(e.key==='Enter')doSearch();};
  }

  // ═══ INICIALIZAÇÃO ═══
  // Verifica notificações quando a Área do Aluno abre
  let _notifChecked=false;
  function initNotifications(){
    if(_notifChecked)return;
    _notifChecked=true;
    setTimeout(checkAndShowNotifications,5000); // espera 5s pra deixar o app carregar
  }

  // Expõe namespace
  window.__gdiStudy = window.__gdiStudy || {};
  window.__gdiStudy.notifications = {
    checkAndShow: checkAndShowNotifications,
    init: initNotifications,
    searchNotes: searchNotes,
    renderSearchUI: renderSearchUI
  };

  // Init quando media:ready (primeiro vídeo carrega) ou após 10s
  try{
    if(typeof Bus!=='undefined'&&Bus&&typeof Bus.onGlobal==='function'){
      Bus.onGlobal('media:ready',()=>initNotifications());
    }
  }catch(_){}
  setTimeout(initNotifications,10000);

  console.log('[GDI Notifications] v1.0.140 — in-app reminders + notes search ativo');
})();
