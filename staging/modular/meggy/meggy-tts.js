// meggy-tts.js — TTSPlayer: voz natural pt-BR p/ os resumos da Meggy
// ★ v2.15.4 ITEM D (v2/V2_15_4_TTS_RESEARCH.md §3). Carregado pelo
// gdi-extras-loader.js (MEGGY_CHAIN, após meggy-summaries.js).
//
// Camadas (mesma ordem do catálogo do Worker):
//   1. Server-side POST /api/tts (Edge TTS neural → Google TTS) — <audio>.
//   2. speechSynthesis local (voz do aparelho) — só quando o servidor
//      falha (503/rede) E existe voz pt-BR no aparelho; sem voz pt-BR,
//      pula direto p/ erro (o Chrome cairia p/ inglês em silêncio).
//   3. (dentro do servidor) Google TTS — o Worker já tenta antes do 503.
// Degradação VISÍVEL: selo "🔊 voz do aparelho" / "🔊 voz básica".
// Erro final vira toast, nunca spinner infinito.
//
// Uso (botões via patch scripts — nunca editam este arquivo):
//   window.gdiTTS.play(textoMarkdown, {onEnd})   // resumo / ISA
//   window.gdiTTS.playModuleSummary(nomeModulo, coursePath)
//   window.gdiTTS.stop() / .pause() / .resume()
//   window.gdiTTS.setVoice('francisca'|'antonio') / .setRate(0.75–1.5)
// Voz e velocidade persistem em localStorage (gdi-tts-voice / gdi-tts-rate).
// Exposto p/ testes: window.gdiTTS._internals = {sanitizeText, chunkText,
//   estimateSeconds, cacheKey} (cacheKey é assíncrono — SHA-256).
(function () {
  'use strict';

  var CHUNK_MAX = 800;          // chars por chunk (Edge aceita mais; 800 mantém cada request <3s)
  var CHARS_PER_SEC = 14;       // estimativa de fala pt-BR a 1× (§3.4: ~13–15 chars/s)
  var LS_VOICE = 'gdi-tts-voice';
  var LS_RATE = 'gdi-tts-rate';

  // ── Higienização: tira markdown/emoji/links antes de sintetizar ──
  function sanitizeText(input) {
    var t = String(input || '');
    t = t.replace(/```[\s\S]*?```/g, ' ');              // blocos de código
    t = t.replace(/`([^`]*)`/g, '$1');                  // código inline
    t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');      // imagens → alt
    t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');       // links → texto
    t = t.replace(/https?:\/\/\S+/g, ' ');              // URLs nuas
    t = t.replace(/^#{1,6}\s+/gm, '');                  // títulos
    t = t.replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1'); // negrito/itálico
    t = t.replace(/<[^>]+>/g, ' ');                     // tags HTML
    t = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{FE0F}]/gu, ' '); // emojis/símbolos
    t = t.replace(/—|–/g, ',');                         // travessão → vírgula
    t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, 'e').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    t = t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  // ── Chunking por frase: nunca corta a meio de frase; ≤800 chars ──
  function chunkText(text) {
    var clean = sanitizeText(text);
    if (!clean) return [];
    var sentences = clean.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [clean];
    var out = [];
    var cur = '';
    function pushWordSplit(s) {
      var rest = s;
      while (rest.length > CHUNK_MAX) {
        var cut = rest.lastIndexOf(' ', CHUNK_MAX);
        if (cut < 40) cut = CHUNK_MAX;
        out.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest) out.push(rest);
    }
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i].trim();
      if (!s) continue;
      if (s.length > CHUNK_MAX) { if (cur) { out.push(cur); cur = ''; } pushWordSplit(s); continue; }
      if (cur && (cur.length + 1 + s.length) > CHUNK_MAX) { out.push(cur); cur = s; }
      else cur = cur ? cur + ' ' + s : s;
    }
    if (cur) out.push(cur);
    return out.filter(Boolean);
  }

  function estimateSeconds(chunks, rate) {
    var total = 0;
    for (var i = 0; i < chunks.length; i++) total += chunks[i].length;
    return Math.max(1, Math.round(total / CHARS_PER_SEC / (rate || 1)));
  }

  // Chave de cache (espelha o servidor: SHA-256 de texto normalizado +
  // voz + velocidade). Assíncrona; cai p/ hash FNV se crypto.subtle falhar.
  async function cacheKey(text, voice, rate) {
    var norm = String(text || '').replace(/\s+/g, ' ').trim() + '|' + voice + '|' + String(rate || 1);
    try {
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
        return 'tts:' + Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      }
    } catch (_) { /* fallback abaixo */ }
    var h = 2166136261;
    for (var i = 0; i < norm.length; i++) { h ^= norm.charCodeAt(i); h = Math.imul(h, 16777619); }
    return 'tts:fnv:' + (h >>> 0).toString(16);
  }

  // ── Estado / persistência ──
  function loadVoice() {
    try { var v = localStorage.getItem(LS_VOICE); return (v === 'antonio' || v === 'francisca') ? v : 'francisca'; } catch (_) { return 'francisca'; }
  }
  function loadRate() {
    try { var r = parseFloat(localStorage.getItem(LS_RATE)); return (isFinite(r) && r >= 0.75 && r <= 1.5) ? r : 1; } catch (_) { return 1; }
  }

  var state = {
    status: 'idle',           // idle | loading | playing | paused | error
    voice: loadVoice(),
    rate: loadRate(),
    chunks: [],
    index: 0,
    provider: null,           // 'server' | 'device' | null
    providerLabel: '',
    elapsedSec: 0,
    totalSec: 0,
    error: null
  };
  var audioEl = null;         // <audio> único p/ camadas server-side
  var audioUrl = null;        // object URL do chunk atual (revogado ao trocar)
  var prefetchUrl = null;     // object URL do próximo chunk (pré-fetch)
  var prefetchIdx = -1;
  var utterQueue = [];        // utterances speechSynthesis (camada local)
  var elapsedTimer = null;
  var listeners = [];
  var currentOnEnd = null;
  var stoppedFlag = false;

  function toast(msg) {
    try {
      if (typeof window.showToast === 'function') { window.showToast(msg); return; }
      if (typeof window.gdiToast === 'function') { window.gdiToast(msg); return; }
    } catch (_) {}
    try { console.warn('[gdiTTS]', msg); } catch (_) {}
  }

  function emit() {
    var snap = getState();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](snap); } catch (_) {}
    }
    renderBar();
  }

  function getState() {
    return {
      status: state.status, voice: state.voice, rate: state.rate,
      index: state.index, total: state.chunks.length,
      provider: state.provider, providerLabel: state.providerLabel,
      elapsedSec: state.elapsedSec, totalSec: state.totalSec, error: state.error
    };
  }

  function setStatus(s, err) {
    state.status = s;
    state.error = err || null;
    emit();
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    elapsedTimer = setInterval(function () {
      if (state.status === 'playing') { state.elapsedSec++; emit(); }
    }, 1000);
  }
  function stopElapsedTimer() { if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; } }

  // ── Barra de controle (criada sob demanda; some com stop) ──
  var barEl = null;
  function ensureBar() {
    if (barEl && document.body.contains(barEl)) return barEl;
    barEl = document.createElement('div');
    barEl.id = 'gdi-tts-bar';
    barEl.setAttribute('role', 'region');
    barEl.setAttribute('aria-label', 'Leitor de resumo Meggy');
    barEl.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:10003;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:min(94vw,560px);background:#161b22;border:1px solid rgba(255,139,159,.35);border-radius:14px;padding:8px 12px;box-shadow:0 8px 28px rgba(0,0,0,.5);color:#e6edf3;font-size:13px;';
    barEl.innerHTML =
      '<button data-act="toggle" aria-label="Pausar ou continuar" style="background:#ff8b9f;border:none;color:#000;border-radius:8px;padding:6px 10px;cursor:pointer;font-weight:700;">⏸ Pausar</button>' +
      '<button data-act="stop" aria-label="Parar" style="background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#e6edf3;border-radius:8px;padding:6px 10px;cursor:pointer;">⏹ Parar</button>' +
      '<select data-act="rate" aria-label="Velocidade" style="background:#0d1117;color:#e6edf3;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px;cursor:pointer;">' +
        '<option value="0.75">0,75×</option><option value="1">1×</option><option value="1.25">1,25×</option><option value="1.5">1,5×</option>' +
      '</select>' +
      '<select data-act="voice" aria-label="Voz" style="background:#0d1117;color:#e6edf3;border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:6px;cursor:pointer;">' +
        '<option value="francisca">Francisca ♀</option><option value="antonio">Antonio ♂</option>' +
      '</select>' +
      '<span data-role="progress" style="color:#9aa4b8;white-space:nowrap;"></span>' +
      '<span data-role="badge" style="color:#5ddeda;white-space:nowrap;"></span>';
    barEl.querySelector('[data-act="toggle"]').onclick = function () { if (state.status === 'paused') resume(); else pause(); };
    barEl.querySelector('[data-act="stop"]').onclick = function () { stop(); };
    barEl.querySelector('[data-act="rate"]').onchange = function (e) { setRate(parseFloat(e.target.value)); };
    barEl.querySelector('[data-act="voice"]').onchange = function (e) { setVoice(e.target.value); };
    document.body.appendChild(barEl);
    return barEl;
  }
  function renderBar() {
    if (!barEl || !document.body.contains(barEl)) return;
    var toggle = barEl.querySelector('[data-act="toggle"]');
    if (toggle) toggle.textContent = (state.status === 'paused') ? '▶ Continuar' : '⏸ Pausar';
    var rateSel = barEl.querySelector('[data-act="rate"]');
    if (rateSel) rateSel.value = String(state.rate);
    var voiceSel = barEl.querySelector('[data-act="voice"]');
    if (voiceSel) voiceSel.value = state.voice;
    var prog = barEl.querySelector('[data-role="progress"]');
    if (prog) {
      var total = state.chunks.length;
      prog.textContent = total
        ? ('Trecho ' + (Math.min(state.index + 1, total)) + '/' + total + ' · ~' + fmtTime(state.elapsedSec) + ' / ~' + fmtTime(state.totalSec))
        : '';
    }
    var badge = barEl.querySelector('[data-role="badge"]');
    if (badge) badge.textContent = state.providerLabel || '';
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function hideBar() { if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl); barEl = null; }

  // ── Camada local: detecção de voz pt-BR ──
  function ptBrVoices() {
    try {
      if (!('speechSynthesis' in window)) return [];
      var vs = window.speechSynthesis.getVoices() || [];
      return vs.filter(function (v) { return v && v.lang && v.lang.toLowerCase().indexOf('pt') === 0; });
    } catch (_) { return []; }
  }
  function pickLocalVoice() {
    var vs = ptBrVoices();
    if (!vs.length) return null;
    var fem = /luciana|francisca|maria|heloisa|vitoria|fernanda|google.*portugu/i;
    var masc = /antonio|daniel|felipe|ricardo|google.*portugu/i;
    var pref = (state.voice === 'antonio') ? masc : fem;
    for (var i = 0; i < vs.length; i++) if (pref.test(vs[i].name || '')) return vs[i];
    for (var j = 0; j < vs.length; j++) if ((vs[j].lang || '').toLowerCase() === 'pt-br') return vs[j];
    return vs[0];
  }
  function waitForVoices(timeoutMs) {
    return new Promise(function (resolve) {
      if (ptBrVoices().length) { resolve(true); return; }
      var done = false;
      var finish = function (ok) { if (!done) { done = true; resolve(ok); } };
      try {
        window.speechSynthesis.addEventListener('voiceschanged', function h() {
          try { window.speechSynthesis.removeEventListener('voiceschanged', h); } catch (_) {}
          finish(ptBrVoices().length > 0);
        });
      } catch (_) {}
      setTimeout(function () { finish(ptBrVoices().length > 0); }, timeoutMs || 1500);
    });
  }

  // ── Camada server-side: fetch do chunk → Blob URL (com pré-fetch) ──
  async function fetchChunkAudio(idx) {
    var r = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: state.chunks[idx], voice: state.voice, rate: state.rate })
    });
    if (r.status === 401) { var e1 = new Error('auth'); e1.status = 401; throw e1; }
    if (r.status === 429) { var e2 = new Error('rate'); e2.status = 429; throw e2; }
    if (r.status === 503) { var e3 = new Error('providers'); e3.status = 503; throw e3; }
    if (!r.ok) { var e4 = new Error('tts http ' + r.status); e4.status = r.status; throw e4; }
    var blob = await r.blob();
    if (!blob || blob.size < 100) throw new Error('tts empty audio');
    return { url: URL.createObjectURL(blob), provider: r.headers.get('X-TTS-Provider') || 'server' };
  }
  function prefetchNext() {
    var next = state.index + 1;
    if (next >= state.chunks.length || prefetchIdx === next) return;
    prefetchIdx = next;
    fetchChunkAudio(next).then(function (res) {
      if (stoppedFlag || state.index + 1 !== next) { try { URL.revokeObjectURL(res.url); } catch (_) {} return; }
      prefetchUrl = res.url;
    }).catch(function () { prefetchIdx = -1; /* o play do próximo tenta de novo */ });
  }

  function ensureAudio() {
    if (!audioEl) {
      audioEl = new Audio();
      audioEl.preload = 'auto';
      audioEl.onended = function () { if (!stoppedFlag) playNextChunk(); };
      audioEl.onerror = function () { if (!stoppedFlag) failOverToLocal('Não foi possível tocar este trecho.'); };
    }
    return audioEl;
  }

  async function playChunkServer(idx) {
    var res;
    if (prefetchIdx === idx && prefetchUrl) { res = { url: prefetchUrl, provider: 'server' }; prefetchUrl = null; prefetchIdx = -1; }
    else res = await fetchChunkAudio(idx);
    if (stoppedFlag) { try { URL.revokeObjectURL(res.url); } catch (_) {} return; }
    var a = ensureAudio();
    if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (_) {} }
    audioUrl = res.url;
    a.src = audioUrl;
    a.playbackRate = state.rate;
    state.provider = 'server';
    state.providerLabel = (res.provider === 'google') ? '🔊 voz básica' : '';
    setStatus('playing');
    try {
      await a.play();
      if (isFinite(a.duration) && a.duration > 0) {
        var remaining = 0;
        for (var k = idx + 1; k < state.chunks.length; k++) remaining += state.chunks[k].length;
        state.totalSec = Math.round(state.elapsedSec + a.duration + remaining / CHARS_PER_SEC / state.rate);
      }
    } catch (e) { failOverToLocal('O navegador bloqueou o áudio. Toque novamente.'); return; }
    prefetchNext();
    emit();
  }

  // ── Camada local (speechSynthesis): um utterance por chunk ──
  // (utterances longas são cortadas ~15s no Chrome — o chunking evita isso).
  function playChunkLocal(idx) {
    if (stoppedFlag) return;
    state.provider = 'device';
    state.providerLabel = '🔊 voz do aparelho';
    setStatus('playing');
    var u = new SpeechSynthesisUtterance(state.chunks[idx]);
    u.lang = 'pt-BR';
    u.rate = state.rate;
    var v = pickLocalVoice();
    if (v) u.voice = v;
    u.onend = function () { if (!stoppedFlag) playNextChunk(); };
    u.onerror = function () { if (!stoppedFlag) finishWithError('Não foi possível falar este trecho no aparelho.'); };
    utterQueue.push(u);
    try { window.speechSynthesis.speak(u); } catch (e) { finishWithError('A voz do aparelho não está disponível.'); }
    emit();
  }

  async function playNextChunk() {
    if (stoppedFlag) return;
    state.index++;
    if (state.index >= state.chunks.length) { finishOk(); return; }
    if (state.provider === 'device') { playChunkLocal(state.index); return; }
    try { await playChunkServer(state.index); }
    catch (e) { failOverToLocal(null, e); }
  }

  async function failOverToLocal(msg, err) {
    if (stoppedFlag) return;
    if (err && err.status === 401) { finishWithError('Faça login novamente para ouvir o resumo.'); return; }
    if (err && err.status === 429) { finishWithError('Muitos trechos em pouco tempo — aguarde um minuto.'); return; }
    var hasPtBr = await waitForVoices(1500);
    if (!hasPtBr) {
      finishWithError('Não foi possível gerar o áudio (servidor indisponível) e este aparelho não tem voz em português.');
      return;
    }
    if (msg) toast(msg + ' Usando a voz do aparelho.');
    playChunkLocal(state.index);
  }

  function finishOk() {
    stopElapsedTimer();
    var cb = currentOnEnd; currentOnEnd = null;
    setStatus('idle');
    hideBar();
    try { if (audioEl) audioEl.pause(); } catch (_) {}
    if (cb) { try { cb(); } catch (_) {} }
  }

  function finishWithError(msg) {
    stopElapsedTimer();
    state.error = msg;
    setStatus('error', msg);
    toast(msg);
    hideBar();
    var cb = currentOnEnd; currentOnEnd = null;
    try { if (audioEl) audioEl.pause(); } catch (_) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
    if (cb) { try { cb(new Error(msg)); } catch (_) {} }
  }

  // ── API pública ──
  function stop() {
    stoppedFlag = true;
    stopElapsedTimer();
    try { if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); } } catch (_) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (_) {}
    if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (_) {} audioUrl = null; }
    if (prefetchUrl) { try { URL.revokeObjectURL(prefetchUrl); } catch (_) {} prefetchUrl = null; }
    prefetchIdx = -1;
    utterQueue = [];
    state.chunks = [];
    state.index = 0;
    state.provider = null;
    state.providerLabel = '';
    state.elapsedSec = 0;
    state.totalSec = 0;
    currentOnEnd = null;
    setStatus('idle');
    hideBar();
    stoppedFlag = false;
  }

  function pause() {
    if (state.status !== 'playing') return;
    try { if (audioEl && state.provider === 'server') audioEl.pause(); } catch (_) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.pause(); } catch (_) {}
    setStatus('paused');
  }

  function resume() {
    if (state.status !== 'paused') return;
    setStatus('playing');
    try { if (audioEl && state.provider === 'server') audioEl.play().catch(function () {}); } catch (_) {}
    try { if ('speechSynthesis' in window) window.speechSynthesis.resume(); } catch (_) {}
  }

  function setVoice(v) {
    if (v !== 'francisca' && v !== 'antonio') return false;
    state.voice = v;
    try { localStorage.setItem(LS_VOICE, v); } catch (_) {}
    emit();
    return true;
  }

  function setRate(r) {
    r = Number(r);
    if (!isFinite(r) || r < 0.75 || r > 1.5) return false;
    state.rate = r;
    try { localStorage.setItem(LS_RATE, String(r)); } catch (_) {}
    try { if (audioEl) audioEl.playbackRate = r; } catch (_) {}
    if (state.chunks.length) state.totalSec = estimateSeconds(state.chunks, r);
    emit();
    return true;
  }

  async function play(rawText, opts) {
    opts = opts || {};
    stop();
    var chunks = chunkText(rawText);
    if (!chunks.length) { toast('Não há texto para ouvir neste resumo.'); return false; }
    state.chunks = chunks;
    state.index = 0;
    state.elapsedSec = 0;
    state.totalSec = estimateSeconds(chunks, state.rate);
    currentOnEnd = (typeof opts.onEnd === 'function') ? opts.onEnd : null;
    ensureBar();
    setStatus('loading');
    startElapsedTimer();
    try {
      await playChunkServer(0);
    } catch (e) {
      await failOverToLocal(null, e);
    }
    return true;
  }

  // Resumo por módulo: o batalhão grava o 1º resumo do módulo no pool
  // compartilhado com lessonName = nome do módulo (startBattalion).
  async function playModuleSummary(moduleName, coursePath) {
    var name = String(moduleName || '').trim();
    var base = '';
    try { base = String(coursePath || '').split('/').filter(Boolean).pop() || ''; } catch (_) {}
    var tries = [];
    if (name) tries.push(name);
    if (base && base !== name) tries.push(decodeURIComponent(base));
    for (var i = 0; i < tries.length; i++) {
      try {
        var r = await fetch('/api/ai/shared-summaries?lesson=' + encodeURIComponent(tries[i]), { cache: 'no-store' });
        var d = await r.json();
        var list = (d && d.ok && Array.isArray(d.summaries)) ? d.summaries : [];
        var hit = null;
        for (var j = 0; j < list.length; j++) {
          if (list[j] && typeof list[j].summary === 'string' && list[j].summary.length > 50) { hit = list[j]; break; }
        }
        if (hit) { toast('▶ Ouvindo resumo do módulo: ' + (hit.lessonName || name)); return play(hit.summary, {}); }
      } catch (_) { /* tenta o próximo filtro */ }
    }
    toast('Ainda não há resumo gerado para este módulo — use "🐩 Gerar resumo + flashcards deste módulo" primeiro.');
    return false;
  }

  window.gdiTTS = {
    play: play,
    playModuleSummary: playModuleSummary,
    stop: stop,
    pause: pause,
    resume: resume,
    setVoice: setVoice,
    setRate: setRate,
    getState: getState,
    onState: function (cb) { if (typeof cb === 'function') listeners.push(cb); return function () { listeners = listeners.filter(function (f) { return f !== cb; }); }; },
    _internals: { sanitizeText: sanitizeText, chunkText: chunkText, estimateSeconds: estimateSeconds, cacheKey: cacheKey, CHUNK_MAX: CHUNK_MAX }
  };
})();
