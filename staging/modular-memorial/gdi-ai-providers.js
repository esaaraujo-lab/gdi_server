// ═══════════════════════════════════════════════════════════════
// gdi-ai-providers.js — Provedores de IA extras para a Meggy
// ═══════════════════════════════════════════════════════════════
//
// Provedores gratuitos adicionais (sem necessidade de cartão):
//   1. Pollinations.ai  — LLM sem API key (OpenAI-compatible)
//   2. Groq             — LLM ultra-rápido (500 tok/s, precisa de key)
//   3. OCR.space        — OCR de PDF escaneado (sem key, 100 req/dia)
//   4. Browser TTS      — Leitura em voz alta (nativo do browser, sem key)
//
// Este arquivo é carregado pelo gdi-extras-loader.js como módulo opcional.
// Se falhar, a Meggy continua funcionando com os backends do worker.js.
// ═══════════════════════════════════════════════════════════════

(function(){
  if(window.__GDI_AI_PROVIDERS)return; // guard anti-duplicate
  window.__GDI_AI_PROVIDERS=true;

  // ── 1. Pollinations.ai (sem API key) ──
  //   GET https://text.pollinations.ai/{prompt}?model=openai-fast
  //   Retorna texto puro. Sem key, sem registro.
  //   Tempo: ~5-25s dependendo do tamanho do prompt.
  async function pollinationsComplete(prompt, opts){
    opts=opts||{};
    const maxTokens=opts.maxTokens||8192;
    // Pollinations aceita POST com body JSON (OpenAI-compatible)
    const body=JSON.stringify({
      model:opts.model||'openai-fast',
      messages:[{role:'user',content:prompt}],
      max_tokens:maxTokens,
      temperature:0.6
    });
    const r=await fetch('https://text.pollinations.ai/openai',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:body
    });
    if(!r.ok)throw new Error('Pollinations HTTP '+r.status);
    const data=await r.json();
    const text=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;
    if(!text||text.trim().length<10)throw new Error('Pollinations: resposta vazia');
    return text;
  }

  // ── 2. Groq (ultra-rápido, precisa de key) ──
  //   POST https://api.groq.com/openai/v1/chat/completions
  //   Modelos: llama-3.3-70b-versatile, openai/gpt-oss-120b, llama-3.1-8b-instant
  //   Tempo: ~1-3s (500 tok/s!)
  //   A key é lida do worker via /api/ai/groq-key (proxy seguro)
  async function groqComplete(prompt, opts){
    opts=opts||{};
    // Busca a key do Groq do worker (não expõe a key no client)
    const keyResp=await fetch('/api/ai/groq-key',{cache:'no-store'});
    if(!keyResp.ok)throw new Error('Groq key não configurada');
    const keyData=await keyResp.json();
    if(!keyData.key)throw new Error('Groq key ausente');
    const body=JSON.stringify({
      model:opts.model||'llama-3.3-70b-versatile',
      messages:[{role:'user',content:prompt}],
      max_tokens:opts.maxTokens||8192,
      temperature:0.6,
      stream:false
    });
    const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+keyData.key
      },
      body:body
    });
    if(!r.ok){
      const err=await r.json().catch(()=>({}));
      throw new Error('Groq HTTP '+r.status+': '+(err.error&&err.error.message||''));
    }
    const data=await r.json();
    const text=data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content;
    if(!text)throw new Error('Groq: resposta vazia');
    return text;
  }

  // ── 3. OCR.space (sem API key, 100 req/dia) ──
  //   POST https://api.ocr.space/parse/image
  //   Extrai texto de PDFs escaneados (imagens).
  async function ocrSpace(fileOrUrl, opts){
    opts=opts||{};
    const formData=new FormData();
    formData.append('apikey','helloworld'); // anonymous key
    formData.append('language',opts.language||'por');
    formData.append('isOverlayRequired','false');
    if(typeof fileOrUrl==='string'){
      formData.append('url',fileOrUrl);
    }else{
      formData.append('file',fileOrUrl);
    }
    const r=await fetch('https://api.ocr.space/parse/image',{
      method:'POST',
      body:formData
    });
    if(!r.ok)throw new Error('OCR.space HTTP '+r.status);
    const data=await r.json();
    if(data.ParsedResults&&data.ParsedResults[0]){
      return data.ParsedResults[0].ParsedText||'';
    }
    throw new Error('OCR.space: '+data.ErrorMessage||'sem resultado');
  }

  // ── 4. Browser TTS (nativo, sem API key) ──
  //   Usa window.speechSynthesis (Web Speech API)
  //   Funciona offline, sem download, em todos os navegadores modernos.
  //   Vozes pt-BR disponíveis: Google português do Brasil, etc.
  let _ttsUtterance=null;
  let _ttsVoices=null;
  function getTtsVoices(){
    if(_ttsVoices)return _ttsVoices;
    _ttsVoices=window.speechSynthesis?window.speechSynthesis.getVoices():[];
    return _ttsVoices;
  }
  function ttsSpeak(text, opts){
    opts=opts||{};
    if(!window.speechSynthesis){
      console.warn('[Meggy TTS] speechSynthesis não disponível');
      return false;
    }
    // Parar fala anterior
    window.speechSynthesis.cancel();
    const utter=new SpeechSynthesisUtterance(text);
    utter.lang='pt-BR';
    utter.rate=opts.rate||1.0;
    utter.pitch=opts.pitch||1.0;
    // Buscar voz pt-BR
    const voices=getTtsVoices();
    const ptVoice=voices.find(v=>v.lang.startsWith('pt'));
    if(ptVoice)utter.voice=ptVoice;
    utter.onend=opts.onEnd||null;
    utter.onerror=opts.onError||null;
    _ttsUtterance=utter;
    window.speechSynthesis.speak(utter);
    return true;
  }
  function ttsStop(){
    if(window.speechSynthesis)window.speechSynthesis.cancel();
  }
  function ttsIsSpeaking(){
    return window.speechSynthesis&&window.speechSynthesis.speaking;
  }

  // ── API pública ──
  window.gdiAiProviders={
    pollinations:{
      complete:pollinationsComplete,
      name:'Pollinations (free, sem key)'
    },
    groq:{
      complete:groqComplete,
      name:'Groq (ultra-rápido)'
    },
    ocr:{
      extract:ocrSpace,
      name:'OCR.space (free, sem key)'
    },
    tts:{
      speak:ttsSpeak,
      stop:ttsStop,
      isSpeaking:ttsIsSpeaking,
      getVoices:getTtsVoices,
      name:'Browser TTS (nativo)'
    },
    // Tenta todos os provedores em paralelo (race) — primeiro a responder vence
    async race(prompt, opts){
      opts=opts||{};
      const promises=[];
      // 1. Pollinations (sem key, sempre disponível)
      promises.push(pollinationsComplete(prompt,opts).then(r=>({text:r,provider:'pollinations'})).catch(e=>null));
      // 2. Groq (se key configurada)
      promises.push(groqComplete(prompt,opts).then(r=>({text:r,provider:'groq'})).catch(e=>null));
      // Race — primeiro que responder vence
      const results=await Promise.allSettled(promises);
      for(const r of results){
        if(r.status==='fulfilled'&&r.value&&r.value.text){
          return r.value;
        }
      }
      throw new Error('Todos os provedores falharam');
    }
  };

  console.log('[Meggy] gdi-ai-providers.js carregado: Pollinations + Groq + OCR + TTS');
})();
