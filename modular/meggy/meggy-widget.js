// ═══════════════════════════════════════════════════════════════
// meggy-widget.js — M-AI floating chat widget (FAB + panel + memory)
//
// Module 7 of 7 (modular/meggy/).
// Sourced from gdi-meggy.js M-AI IIFE (lines 2383-2888, verbatim).
//
// M-AI: widget da Meggy 🐩 — poodle tutora de estudos. Botão flutuante +
// painel de chat. PRIORIDADE de backend:
//   1) IA do navegador (Chrome Prompt API / Gemini Nano via ai.languageModel)
//   2) POST /api/ai (worker.js → CF Workers AI ou OpenAI-compat)
// Conversa persistida em sessionStorage. UI no <html> (fora do body) para
// sobreviver a trocas de página. Estilo Ferreto.
//
// Exposes:
//   • window.__gdiMeggy.widget = { open, close, toggle, send, renderHistory,
//     updateStatus, addMsg, hideWidget, showWidget, checkServerStatus,
//     serverLabel, __gdiMeggySuggest }
//   • window.__gdiMeggySuggest  (alias — preserved for backward compat)
//
// Guard: window.__gdiMeggyWidget
// Depends on: utils (CONSTS for MEGGY_NAME/AVATAR/TAG/ISA_SYS/STORE/MEMORY_KEY,
//   renderMd, esc — but widget keeps its own local renderMd/esc per study §8.9
//   recommendation (a) to minimize behavior change in first modularization pass)
// External: Bus, GDI_ROOT(), window.CACHE_VERSION, window.marked,
//   window.gdiSanitize, sessionStorage/localStorage
// ═══════════════════════════════════════════════════════════════
(function(){
  if(window.__gdiMeggyWidget)return;
  window.__gdiMeggyWidget=true;

  window.__gdiMeggy = window.__gdiMeggy || {};

  // ── Constants (read from utils.CONSTS — single source of truth) ──
  const U = window.__gdiMeggy.utils;
  const MEGGY_NAME = U.CONSTS.MEGGY_NAME;
  const MEGGY_AVATAR = U.CONSTS.MEGGY_AVATAR;
  const MEGGY_TAG = U.CONSTS.MEGGY_TAG;
  const ISA_SYS = U.CONSTS.ISA_SYS;
  const STORE = U.CONSTS.STORE;
  const MEMORY_KEY = U.CONSTS.MEMORY_KEY;

  // CSS
  if(!document.getElementById('gdi-ai-style')){
    const s=document.createElement('style');s.id='gdi-ai-style';s.textContent=`
#gdi-ai-fab{position:fixed;bottom:20px;right:20px;z-index:2147483646;width:56px;height:56px;border-radius:50%;
  border:0;cursor:pointer;background:linear-gradient(135deg,rgba(255,139,159,.7) 0%,rgba(192,38,211,.7) 55%,rgba(93,222,218,.7) 130%);
  display:flex;align-items:center;justify-content:center;overflow:hidden;
  box-shadow:0 8px 28px -6px rgba(255,139,159,.4),0 0 0 1px rgba(255,255,255,.08);
  transition:transform .18s,box-shadow .18s,opacity .18s;opacity:.65;}
#gdi-ai-fab:hover{transform:scale(1.08) translateY(-2px);box-shadow:0 12px 36px -6px rgba(255,139,159,.6);opacity:1;}
#gdi-ai-fab .gdi-ai-fab-ico{width:52px;height:52px;line-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden;border-radius:50%;}
#gdi-ai-fab .gdi-ai-fab-ico svg,#gdi-ai-fab .gdi-ai-fab-ico img{width:100%;height:100%;border-radius:50%;display:block;object-fit:cover;}
#gdi-ai-fab-badge{position:absolute;top:-2px;right:-2px;width:16px;height:16px;border-radius:50%;
  background:#5ddeda;border:2px solid var(--ferreto-bg,#070910);display:none;}
#gdi-ai-fab-badge.show{display:block;animation:gdi-ai-pulse 1.6s ease infinite;}
@keyframes gdi-ai-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.25);}}
#gdi-ai-panel{position:fixed;bottom:88px;right:20px;z-index:2147483647;width:380px;max-width:calc(100vw - 32px);
  height:540px;max-height:calc(100vh - 120px);display:none;flex-direction:column;
  background:var(--ferreto-surface,rgba(22,27,38,.92));
  -webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);
  border:1px solid var(--ferreto-border-strong,rgba(255,255,255,.16));
  border-radius:18px;box-shadow:0 20px 60px -12px rgba(0,0,0,.6);
  overflow:hidden;transform-origin:bottom right;animation:gdi-ai-in .22s ease;font-family:var(--ferreto-font-body,'Rubik',sans-serif);}
@keyframes gdi-ai-in{from{opacity:0;transform:scale(.92) translateY(12px);}to{opacity:1;transform:none;}}
#gdi-ai-panel.open{display:flex;}
#gdi-ai-head{display:flex;align-items:center;gap:10px;padding:14px 16px;
  background:linear-gradient(135deg,rgba(255,139,159,.18),rgba(93,222,218,.1));
  border-bottom:1px solid var(--ferreto-border,rgba(255,255,255,.09));}
#gdi-ai-head .gdi-ai-avatar{width:38px;height:38px;border-radius:50%;flex:none;
  background:linear-gradient(135deg,#ff8b9f,#c026d3);display:flex;align-items:center;justify-content:center;
  color:#fff;line-height:1;overflow:hidden;
  box-shadow:0 0 0 2px rgba(255,255,255,.1) inset;}
#gdi-ai-head .gdi-ai-avatar svg{width:100%;height:100%;border-radius:50%;}
#gdi-ai-head .gdi-ai-info{flex:1;min-width:0;}
#gdi-ai-head .gdi-ai-name{font-family:var(--ferreto-font-display,'Poppins',sans-serif);font-size:15px;font-weight:700;color:var(--ferreto-text,#f3f5fa);line-height:1.1;}
#gdi-ai-head .gdi-ai-name .gdi-ai-tag{font-size:10px;font-weight:500;color:var(--ferreto-secondary,#5ddeda);margin-left:5px;letter-spacing:.02em;}
#gdi-ai-head .gdi-ai-status{font-size:11px;color:var(--ferreto-text-muted,#9aa4b8);display:flex;align-items:center;gap:5px;margin-top:2px;}
#gdi-ai-head .gdi-ai-dot{width:7px;height:7px;border-radius:50%;background:#3fb950;}
#gdi-ai-head .gdi-ai-dot.local{background:#5ddeda;}
#gdi-ai-close{background:none;border:0;color:var(--ferreto-text-muted,#9aa4b8);font-size:18px;cursor:pointer;padding:4px;border-radius:8px;}
#gdi-ai-close:hover{background:var(--ferreto-surface-3,rgba(255,255,255,.08));color:var(--ferreto-text,#f3f5fa);}
#gdi-ai-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;}
#gdi-ai-body::-webkit-scrollbar{width:6px;}
#gdi-ai-body::-webkit-scrollbar-thumb{background:var(--ferreto-surface-3,rgba(255,255,255,.08));border-radius:20px;}
.gdi-ai-msg{display:flex;gap:8px;max-width:88%;animation:gdi-ai-in .2s ease;}
.gdi-ai-msg.user{align-self:flex-end;flex-direction:row-reverse;}
.gdi-ai-msg .gdi-ai-bubble{padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.5;word-break:break-word;}
.gdi-ai-msg.assistant .gdi-ai-bubble{background:var(--ferreto-surface-3,rgba(255,255,255,.08));color:var(--ferreto-text,#f3f5fa);border-bottom-left-radius:4px;}
.gdi-ai-msg.user .gdi-ai-bubble{background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;border-bottom-right-radius:4px;}
.gdi-ai-msg .gdi-ai-bubble p{margin:0 0 6px;} .gdi-ai-msg .gdi-ai-bubble p:last-child{margin:0;}
.gdi-ai-msg .gdi-ai-bubble code{background:rgba(0,0,0,.25);padding:1px 5px;border-radius:4px;font-size:12px;}
.gdi-ai-msg .gdi-ai-bubble pre{background:rgba(0,0,0,.3);padding:8px;border-radius:8px;overflow-x:auto;margin:6px 0;}
.gdi-ai-typing{display:flex;gap:4px;padding:4px 0;}
.gdi-ai-typing span{width:7px;height:7px;border-radius:50%;background:var(--ferreto-text-muted,#9aa4b8);animation:gdi-ai-typ 1.2s ease infinite;}
.gdi-ai-typing span:nth-child(2){animation-delay:.2s;} .gdi-ai-typing span:nth-child(3){animation-delay:.4s;}
@keyframes gdi-ai-typ{0%,60%,100%{opacity:.3;transform:translateY(0);}30%{opacity:1;transform:translateY(-4px);}}
#gdi-ai-input-wrap{display:flex;gap:8px;padding:12px;border-top:1px solid var(--ferreto-border,rgba(255,255,255,.09));background:var(--ferreto-surface-2,rgba(255,255,255,.045));}
#gdi-ai-input{flex:1;background:var(--ferreto-surface-3,rgba(255,255,255,.08));border:1px solid var(--ferreto-border,rgba(255,255,255,.09));
  border-radius:999px;padding:10px 14px;color:var(--ferreto-text,#f3f5fa);font-size:13.5px;outline:none;font-family:inherit;transition:.15s;}
#gdi-ai-input:focus{border-color:var(--ferreto-primary,#ff8b9f);box-shadow:0 0 0 3px rgba(255,139,159,.25);}
#gdi-ai-input::placeholder{color:var(--ferreto-text-faint,#6b7488);}
#gdi-ai-send{width:38px;height:38px;border-radius:50%;border:0;cursor:pointer;flex:none;
  background:linear-gradient(135deg,#ff8b9f,#c026d3);color:#fff;font-size:16px;display:flex;align-items:center;justify-content:center;transition:.15s;}
#gdi-ai-send:hover{filter:brightness(1.1);transform:scale(1.05);}
#gdi-ai-send:disabled{opacity:.5;cursor:default;transform:none;}
.gdi-ai-err{font-size:12px;color:#ff8b8b;text-align:center;padding:8px;margin:0 4px;}
.gdi-ai-provider{font-size:10px;color:var(--ferreto-text-faint,#6b7488);text-align:center;padding:2px 0 6px;letter-spacing:.02em;}
.gdi-ai-provider b{color:var(--ferreto-secondary,#5ddeda);}
@media(max-width:480px){#gdi-ai-panel{right:8px;left:8px;width:auto;bottom:80px;height:calc(100vh - 160px);}}
`;document.documentElement.appendChild(s);
  }

  let messages=[];
  try{messages=JSON.parse(sessionStorage.getItem(STORE))||[];}catch(_){}

  function save(){try{sessionStorage.setItem(STORE,JSON.stringify(messages.slice(-20)));}catch(_){}}

  // ── Local renderMd + esc (kept duplicated per study §8.9 rec (a) — first pass) ──
  function renderMd(txt){
    if(window.marked){
      try{
        const html=marked.parse(txt);
        // ★ FIX: nunca retorna HTML não sanitizado — fallback escapa
        if(window.gdiSanitize){try{return window.gdiSanitize(html);}catch(_){}}
        return esc(txt).replace(/\n/g,'<br>');
      }catch(_){}
    }
    return txt.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
  }
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  // ── Detecção da IA do navegador ──
  // Chrome 127+ com "Prompt API for Gemini Nano" habilitado expõe
  // `ai.languageModel`. Extensões Chrome ativam/desativam isso.
  // Também tenta o alias antigo `window.ai`.
  let _browserAIState='unknown'; // 'unknown' | 'ready' | 'download' | 'no'
  let _browserSession=null;
  let _providerLabel='verificando…';

  async function detectBrowserAI(){
    try{
      const ai=(window.ai&&window.ai.languageModel)?window.ai.languageModel:(window.LanguageModel);
      if(ai&&typeof ai.capabilities==='function'){
        const caps=await ai.capabilities();
        if(caps&&caps.available==='readily'){_browserAIState='ready';return 'ready';}
        if(caps&&caps.available==='after-download'){_browserAIState='download';return 'download';}
        _browserAIState='no';return 'no';
      }
    }catch(_){}
    _browserAIState='no';return 'no';
  }

  async function getBrowserSession(){
    if(_browserSession)return _browserSession;
    try{
      const ai=(window.ai&&window.ai.languageModel)?window.ai.languageModel:(window.LanguageModel);
      if(!ai)return null;
      _browserSession=await ai.create({
        systemPrompt:ISA_SYS,
        temperature:0.7,
        topK:3
      });
      return _browserSession;
    }catch(e){console.warn('[Meggy] não pôde criar sessão do navegador:',e);_browserSession=null;return null;}
  }

  async function callBrowserAI(history){
    const sess=await getBrowserSession();
    if(!sess)return null;
    // Prompt API mantém o contexto internamente; enviamos só a última
    // mensagem do usuário (a sessão lembra as anteriores).
    const lastUser=[...history].reverse().find(m=>m.role==='user');
    if(!lastUser)return null;
    const out=await sess.prompt(lastUser.content);
    return out||null;
  }

  function updateStatus(){
    const dot=panel.querySelector('.gdi-ai-dot');
    const st=panel.querySelector('.gdi-ai-status');
    if(!dot||!st)return;
    if(_browserAIState==='ready'){dot.classList.add('local');st.innerHTML='<span class="gdi-ai-dot local"></span> Meggy · IA do navegador · 100% local';_providerLabel='IA do navegador <b>(Chrome/Gemini Nano — local)</b>';}
    else if(_browserAIState==='download'){dot.classList.remove('local');st.innerHTML='<span class="gdi-ai-dot"></span> Meggy · baixando modelo local…';_providerLabel='baixando modelo do navegador…';}
    else{dot.classList.remove('local');st.innerHTML='<span class="gdi-ai-dot"></span> Meggy · online';const sl=serverLabel();_providerLabel=sl.label;}
    const pv=panel.querySelector('.gdi-ai-provider');
    if(pv)pv.innerHTML='via '+_providerLabel;
  }

  // UI no <html> (fora do body) — sobrevive a trocas de página
  const root=GDI_ROOT();
  const fab=document.createElement('button');
  fab.id='gdi-ai-fab';fab.title='Meggy';
  // ★ v1.0.85: FAB usa foto real da Meggy (PNG transparente, flood-fill bg removal — olhos/nariz preservados).
  // object-fit:cover preenche o círculo; alt vazio para não mostrar texto overlay.
  // ★ v1.0.86 modularização: fallback '91' (CACHE_VERSION bump planejado).
  fab.innerHTML='<span class="gdi-ai-fab-ico"><img src="/modular/assets/meggy-fab.png?v='+(window.CACHE_VERSION||'92')+'" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;"></span><span id="gdi-ai-fab-badge"></span>';
  root.appendChild(fab);

  const panel=document.createElement('div');
  panel.id='gdi-ai-panel';
  panel.innerHTML=`
    <div id="gdi-ai-head">
      <div class="gdi-ai-avatar"><img src="/modular/assets/meggy-fab.png?v=${window.CACHE_VERSION||'92'}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;"></div>
      <div class="gdi-ai-info">
        <div class="gdi-ai-name">${MEGGY_NAME}<span class="gdi-ai-tag">${MEGGY_TAG}</span></div>
        <div class="gdi-ai-status"><span class="gdi-ai-dot"></span> verificando…</div>
      </div>
      <button id="gdi-ai-close" title="Fechar"><i class="bi bi-x-lg"></i></button>
    </div>
    <div id="gdi-ai-body"></div>
    <div class="gdi-ai-provider"></div>
    <div class="gdi-ai-quick-actions" style="display:flex;gap:6px;padding:8px 12px;border-top:1px solid var(--ferreto-border,rgba(255,255,255,.09));">
      <button class="gdi-ai-quick" data-action="resumir" style="flex:1;padding:6px 8px;border:1px solid var(--ferreto-border,#30363d);border-radius:8px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));color:var(--ferreto-text,#e6edf3);font-size:11px;cursor:pointer;">💬 Resumir</button>
      <button class="gdi-ai-quick" data-action="questoes" style="flex:1;padding:6px 8px;border:1px solid var(--ferreto-border,#30363d);border-radius:8px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));color:var(--ferreto-text,#e6edf3);font-size:11px;cursor:pointer;">❓ Questões</button>
      <button class="gdi-ai-quick" data-action="explicar" style="flex:1;padding:6px 8px;border:1px solid var(--ferreto-border,#30363d);border-radius:8px;background:var(--ferreto-surface-2,rgba(255,255,255,.04));color:var(--ferreto-text,#e6edf3);font-size:11px;cursor:pointer;">💡 Explicar</button>
    </div>
    <div id="gdi-ai-input-wrap">
      <input id="gdi-ai-input" type="text" placeholder="Pergunte à Meggy 🐩 sobre a aula, peça um resumo..." autocomplete="off">
      <button id="gdi-ai-send" title="Enviar"><i class="bi bi-send-fill"></i></button>
    </div>`;
  root.appendChild(panel);

  const body=panel.querySelector('#gdi-ai-body');
  const input=panel.querySelector('#gdi-ai-input');
  const sendBtn=panel.querySelector('#gdi-ai-send');
  // ★ FIX: badge estava buscando dentro do panel, mas o badge está no fab
  const badge=fab.querySelector('#gdi-ai-fab-badge');

  // ═══ Quick action buttons (Resumir / Questões / Explicar) ═══
  // Fills the input with a canned prompt and triggers send().
  // ★ v80-FIX-MEGGY BUG 7: inject current lesson context so prompts aren't
  //    generic ("desta aula" with no awareness). Falls back to document.title.
  panel.querySelectorAll('.gdi-ai-quick').forEach(btn => {
    btn.onclick = () => {
      const action = btn.dataset.action;
      // ★ v1.0.84: inline lesson name extraction (realLessonName is in another IIFE, not accessible).
      // ★ v1.0.86: agora window.realLessonName existe (meggy-utils.js exporta) — mas mantemos
      //    o fallback inline para robustez.
      let lessonName = '';
      try {
        // Try window.realLessonName first (if exported)
        if (typeof window.realLessonName === 'function') {
          lessonName = window.realLessonName('') || '';
        }
        // Fallback: extract from document.title or URL
        if (!lessonName) {
          const t = document.title || '';
          // title is usually "filename - siteName" or just "filename"
          lessonName = t.split(' - ')[0].split(' | ')[0].trim();
        }
        // Fallback: URL pathname last segment
        if (!lessonName) {
          const p = window.location.pathname;
          const seg = p.split('/').filter(Boolean).pop() || '';
          lessonName = decodeURIComponent(seg);
        }
      } catch(_){}
      const ctx = lessonName ? ` (Aula atual: ${lessonName}. URL: ${window.location.pathname}) ` : ' ';
      let prompt = '';
      if(action === 'resumir') prompt = `Gere um resumo${ctx}desta aula`;
      else if(action === 'questoes') prompt = `Crie 5 questões${ctx}sobre o tema desta aula`;
      else if(action === 'explicar') prompt = `Explique${ctx}o conceito principal desta aula`;
      if(prompt){ input.value = prompt; send(); }
    };
  });

  function addMsg(role,text){
    const m={role,text};
    messages.push(m);
    // ★ v80-FIX-MEGGY BUG 3: cap in-memory messages at 50 (sessionStorage is
    //    already trimmed to 20 in save(), but `messages` grew unbounded, and
    //    renderHistory() rebuilt DOM for every message on every page:change).
    if(messages.length > 50) messages = messages.slice(-50);
    save();
    const el=document.createElement('div');
    el.className='gdi-ai-msg '+(role==='user'?'user':'assistant');
    el.innerHTML='<div class="gdi-ai-bubble">'+(role==='user'?esc(text):renderMd(text))+'</div>';
    body.appendChild(el);body.scrollTop=body.scrollHeight;
    return el;
  }
  // ═══ PATCH C: renderHistory com cache de HTML parseado por mensagem ═══
  // Cacheia m._html + m._text; só re-parseia Markdown se o texto mudou.
  // Usa DocumentFragment para um único reflow.
  function renderHistory(){
    body.innerHTML='';
    if(!messages.length){
      addMsg('assistant','Oi! Sou a **Meggy** 🐩 — sua poodle tutora de estudos.\n\nPosso ajudar com:\n- Explicar um tema da aula\n- Fazer um resumo\n- Tirar dúvidas\n- Sugerir um plano de estudos\n\nO que você precisa hoje? 🐾');
      messages.pop();save(); // saudação não conta no histórico
      return;
    }
    const frag=document.createDocumentFragment();
    messages.forEach(m=>{
      const el=document.createElement('div');
      el.className='gdi-ai-msg '+(m.role==='user'?'user':'assistant');
      // ★ PATCH C: user nunca usa Markdown; assistant cacheia parse
      if(m.role==='user'){
        el.innerHTML='<div class="gdi-ai-bubble">'+esc(m.text)+'</div>';
      }else{
        // cacheia parse Markdown por conteúdo (invalida se texto mudar)
        if(!m._html || m._text!==m.text){
          m._html=renderMd(m.text||'');
          m._text=m.text;
        }
        el.innerHTML='<div class="gdi-ai-bubble">'+m._html+'</div>';
      }
      frag.appendChild(el);
    });
    body.appendChild(frag);
    body.scrollTop=body.scrollHeight;
  }

  let typingEl=null;
  function showTyping(){
    typingEl=document.createElement('div');typingEl.className='gdi-ai-msg assistant';
    typingEl.innerHTML='<div class="gdi-ai-bubble"><div class="gdi-ai-typing"><span></span><span></span><span></span></div></div>';
    body.appendChild(typingEl);body.scrollTop=body.scrollHeight;
  }
  function hideTyping(){if(typingEl){typingEl.remove();typingEl=null;}}

  // ── BANCO DE MEMÓRIA da Meggy ──
  // A Meggy mantém um perfil do aluno e aprende com as interações.
  // Persistido em localStorage + enviado como contexto nas conversas.
  const _meggyLsGet=(k,d)=>{try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(_){return d}};
  const _meggyLsSet=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}};
  function loadMemory(){
    return _meggyLsGet(MEMORY_KEY,{interactions:0,topics:[],weaknesses:[],preferences:{},lastLessons:[]});
  }
  function saveMemory(mem){_meggyLsSet(MEMORY_KEY,mem);}
  function updateMemory(topic,context){
    const mem=loadMemory();
    mem.interactions=(mem.interactions||0)+1;
    if(topic&&!mem.topics.includes(topic)){
      mem.topics.push(topic);
      if(mem.topics.length>50)mem.topics.shift();
    }
    if(topic){
      mem.lastLessons=mem.lastLessons.filter(l=>l!==topic);
      mem.lastLessons.unshift(topic);
      if(mem.lastLessons.length>10)mem.lastLessons.pop();
    }
    try{
      const qs=_meggyLsGet('gdi-questions-v1',[]);
      const srs=_meggyLsGet('gdi-q-srs-v1',{});
      const bySubject={};
      qs.forEach(q=>{
        const s=q.subject||'Geral';
        if(!bySubject[s])bySubject[s]={total:0,correct:0};
        bySubject[s].total++;
        if(srs[q.id]&&srs[q.id].box>0)bySubject[s].correct++;
      });
      mem.weaknesses=Object.entries(bySubject)
        .filter(([,v])=>v.total>=2&&(v.correct/v.total)<0.5)
        .map(([k,v])=>({subject:k,acc:Math.round(v.correct/v.total*100)}))
        .slice(0,5);
    }catch(_){}
    saveMemory(mem);
    return mem;
  }
  function buildMemoryContext(){
    const mem=loadMemory();
    let ctx='';
    if(mem.interactions>0)ctx+=`Aluno tem ${mem.interactions} interações com a Meggy. `;
    if(mem.lastLessons&&mem.lastLessons.length)ctx+=`Últimas aulas estudadas: ${mem.lastLessons.slice(0,5).join(', ')}. `;
    if(mem.weaknesses&&mem.weaknesses.length)ctx+=`Pontos fracos: ${mem.weaknesses.map(w=>w.subject+' ('+w.acc+'%)').join(', ')}. `;
    if(mem.topics&&mem.topics.length>3)ctx+=`Já estudou ${mem.topics.length} tópicos diferentes. `;
    return ctx;
  }

  let busy=false;
  async function send(){
    const txt=input.value.trim();if(!txt||busy)return;
    busy=true;sendBtn.disabled=true;input.value='';
    addMsg('user',txt);
    showTyping();

    // histórico para enviar (role/content) + contexto de memória
    const hist=messages.filter(m=>m.role!=='system').slice(-8).map(m=>({role:m.role,content:m.text}));
    // adiciona contexto de memória na primeira mensagem do histórico
    const memCtx=buildMemoryContext();
    if(memCtx&&hist.length>0){
      hist[0]={role:'assistant',content:'Contexto do aluno: '+memCtx};
    }

    let response=null,usedLocal=false;
    // 1) tenta IA do navegador
    if(_browserAIState==='ready'){
      try{
        response=await callBrowserAI(hist);
        if(response)usedLocal=true;
      }catch(e){console.warn('[Meggy] IA do navegador falhou, caindo p/ servidor:',e);response=null;}
    }
    // 2) fallback servidor /api/ai
    if(!response){
      try{
        const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({message:txt,messages:hist})});
        const data=await r.json();
        hideTyping();
        if(data.ok&&data.response){response=data.response;}
        else{
          const errEl=document.createElement('div');errEl.className='gdi-ai-err';
          errEl.textContent=data.error||'Não consegui responder agora. Tente novamente.';
          body.appendChild(errEl);body.scrollTop=body.scrollHeight;
          setTimeout(()=>errEl.remove(),5000);
          busy=false;sendBtn.disabled=false;input.focus();
          return;
        }
      }catch(e){
        hideTyping();
        const errEl=document.createElement('div');errEl.className='gdi-ai-err';
        errEl.textContent='Erro de conexão. Verifique sua internet.';
        body.appendChild(errEl);body.scrollTop=body.scrollHeight;
        setTimeout(()=>errEl.remove(),5000);
        busy=false;sendBtn.disabled=false;input.focus();
        return;
      }
    }
    hideTyping();
    addMsg('assistant',response);
    // ★ atualiza banco de memória com a interação
    updateMemory(undefined,{question:txt,response:response});
    if(usedLocal)updateStatus(); // confirma que usou local
    busy=false;sendBtn.disabled=false;input.focus();
  }

  function toggle(){
    const open=panel.classList.toggle('open');
    try{sessionStorage.setItem('gdi-meggy-open',open?'1':'0');}catch(_){}
    if(open){badge.classList.remove('show');renderHistory();updateStatus();setTimeout(()=>input.focus(),100);}
  }
  // ★ v1.0.86: open/close convenience wrappers (for namespace exports)
  function open(){ if(!panel.classList.contains('open')) toggle(); }
  function close(){ if(panel.classList.contains('open')) toggle(); }

  fab.addEventListener('click',toggle);
  panel.querySelector('#gdi-ai-close').addEventListener('click',()=>{panel.classList.remove('open');try{sessionStorage.setItem('gdi-meggy-open','0');}catch(_){}});
  sendBtn.addEventListener('click',send);
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}});

  // ═══ PATCH A: page:change com debounce 1.5s + gate por painel aberto ═══
  // Antes: a cada navegação, re-parseava Markdown × 20 msgs + iterava TODAS
  // as questões em updateMemory. Agora: renderHistory só se painel aberto,
  // e updateMemory é debounced 1.5s + throttle 30s quando painel fechado.
  let _memDebounce=null;
  Bus.onGlobal('page:change',()=>{
    const isOpen=panel && panel.classList.contains('open');
    if(isOpen){
      renderHistory();
      updateStatus();
    }
    clearTimeout(_memDebounce);
    _memDebounce=setTimeout(()=>{
      // só recalcular memória se o painel estiver aberto OU a cada 30s
      if(!isOpen && Date.now()-(window._meggyLastMem||0)<30000) return;
      const lesson=document.querySelector('.gdi-file-header-name');
      if(lesson&&lesson.textContent){
        window._meggyLastMem=Date.now();
        updateMemory(lesson.textContent.trim());
      }
    },1500);
  });
  // restaura estado aberto ao carregar
  try{
    if(sessionStorage.getItem('gdi-meggy-open')==='1'){
      setTimeout(()=>{panel.classList.add('open');renderHistory();updateStatus();},500);
    }
  }catch(_){}

  // ── Ativação condicional ──
  // O botão 💖 só aparece se houver IA disponível: (1) IA do navegador
  // pronta, OU (2) /api/ai/status retornar enabled=true. Caso contrário
  // o widget fica oculto (display:none) mas TODO o código permanece
  // intacto — basta configurar ZHIPU_API_KEY no Cloudflare para ativar.
  function hideWidget(){fab.style.display='none';panel.style.display='none';}
  function showWidget(){fab.style.display='';panel.style.display='';}

  let _serverEnabled=null; // null=desconhecido, true/false
  let _serverProvider=null;
  function checkServerStatus(){
    return fetch('/api/ai/status',{cache:'no-store'}).then(r=>r.ok?r.json():{enabled:false}).then(d=>{ _serverEnabled=!!(d&&d.enabled); _serverProvider=(d&&d.provider)||null; return _serverEnabled; }).catch(()=>{ _serverEnabled=false; return false; });
  }
  function serverLabel(){
    if(_serverProvider==='nvidia-nim')return {name:'NVIDIA NIM',label:'NVIDIA NIM <b>(LLaMA · /api/ai)</b>'};
    if(_serverProvider==='zhipu-ai')return {name:'Meggy AI (BlackTie)',label:'Meggy AI <b>(BlackTie GLM · /api/ai)</b>'};
    if(_serverProvider==='cf-workers-ai')return {name:'CF Workers AI',label:'Cloudflare <b>(Workers AI · /api/ai)</b>'};
    if(_serverProvider==='openai')return {name:'OpenAI',label:'OpenAI <b>(/api/ai)</b>'};
    return {name:'Meggy AI (BlackTie)',label:'Meggy AI <b>(BlackTie GLM · /api/ai)</b>'};
  }

  // detecta a IA do navegador ao carregar (1×) + status do servidor
  Promise.all([
    detectBrowserAI(),
    checkServerStatus()
  ]).then(function(){
    updateStatus();
    const browserReady=(_browserAIState==='ready');
    const serverOk=!!_serverEnabled;

    if(browserReady||serverOk){
      showWidget();
    }else{
      // Nenhum backend disponível — esconde o botão mas mantém o código.
      // Ativa automaticamente quando o usuário configurar ZHIPU_API_KEY.
      hideWidget();
          }
  });

  // badge de novidade após 8s se nunca abriu (só se visível)
  if(!sessionStorage.getItem('gdi-ai-seen')){
    setTimeout(()=>{if(fab.style.display!=='none'&&!panel.classList.contains('open'))badge.classList.add('show');},8000);
  }
  fab.addEventListener('click',()=>{sessionStorage.setItem('gdi-ai-seen','1');},{once:true});

  // ═══ __gdiMeggySuggest: floating suggestion banner (used by study modules) ═══
  // Shows a dismissible bottom banner that can either call an `action` callback
  // or default to opening the Meggy FAB. Auto-hides after 8s.
  function __gdiMeggySuggest(text, action){
    let banner = document.querySelector('#gdi-meggy-suggest');
    if(!banner){
      banner = document.createElement('div');
      banner.id = 'gdi-meggy-suggest';
      banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:2147483645;max-width:420px;padding:10px 16px;border-radius:12px;background:linear-gradient(135deg,rgba(255,139,159,.95),rgba(192,38,211,.95));color:#fff;font-size:13px;box-shadow:0 8px 28px -6px rgba(255,139,159,.4);display:none;align-items:center;gap:8px;cursor:pointer;animation:gdi-ai-in .3s ease;';
      banner.innerHTML = '<span class="gdi-suggest-text"></span><span class="gdi-suggest-close" style="margin-left:auto;font-size:16px;opacity:.7;">×</span>';
      (GDI_ROOT()||document.body).appendChild(banner);
      banner.querySelector('.gdi-suggest-close').onclick = (e) => { e.stopPropagation(); banner.classList.remove('show'); banner.style.display='none'; };
    }
    banner.querySelector('.gdi-suggest-text').textContent = text;
    banner.onclick = () => {
      banner.style.display='none';
      if(typeof action === 'function') action();
      else { const fab = document.querySelector('#gdi-ai-fab'); if(fab) fab.click(); }
    };
    banner.style.display = 'flex';
    clearTimeout(banner.__timer);
    banner.__timer = setTimeout(() => { banner.style.display='none'; }, 8000);
  }

  // ── Namespace exports ──
  window.__gdiMeggy.widget = {
    open, close, toggle,
    send,
    renderHistory, updateStatus, addMsg,
    showTyping, hideTyping,
    hideWidget, showWidget,
    checkServerStatus, serverLabel,
    detectBrowserAI, getBrowserSession, callBrowserAI,
    loadMemory, saveMemory, updateMemory, buildMemoryContext,
    __gdiMeggySuggest
  };

  // ── Aliases para compatibilidade (código externo espera estas globais) ──
  // __gdiMeggySuggest — preserved for backward compat (dead export per study §8.7,
  //   but README.md and MANUAL_TECNICO.md mention it as a feature)
  window.__gdiMeggySuggest = function(){ return __gdiMeggySuggest.apply(this, arguments); };

  console.log('[GDI Extras] meggy-widget ativo (Module 7/7) — M-AI widget Meggy 🐩 — poodle tutora');
})();
