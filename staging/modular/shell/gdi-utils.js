/* ════════════════════════════════════════════════════════════════════════════
   gdi-utils.js  —  LEAN utility bundle for Meggy native shell (Fase 1.6)
   ─────────────────────────────────────────────────────────────────────────────
   PURPOSE
     Lets the native shell boot WITHOUT loading the full GDIndex (app.min.js 134KB
     + storage.js 19KB + gdi-list-worker.js 12KB = 165KB). This file ships only
     the small surface the shell needs to render Home, Drives browser, and read
     the user's watched/resume state. The full app.min.js is lazy-loaded later
     only if the user opens a feature that truly needs it.

   SOURCE MAP (what was extracted from where)
     Bus               ← app.min.js lines 21–41   (event bus, ~9 lines original)
     GDIStorage        ← storage.js               (lean: only memo + get/post + invalidate)
     GDIUser           ← app.min.js lines 1412–1580 (user state via /userstate)
     gdiListAllFiles   ← app.min.js lines 77–113  (folder listing w/ LRU cache)
     esc / escHtml     ← app.min.js line 17
     formatFileSize    ← app.min.js line 1393
     lsGet/lsSet/uid/today  — NEW helpers (not in app.min.js; small enough to inline)
     drive_names       ← worker-staging.js authConfig.roots (12 entries)

   EXPORTS (all on window)
     window.Bus, window.GDIStorage, window.GDIUser,
     window.gdiListAllFiles, window.gdiGetPw, window.gdiSetPw,
     window.esc, window.escHtml, window.escJs,
     window.lsGet, window.lsSet, window.uid, window.today,
     window.formatFileSize, window.sleep, window.gdiOkPath,
     window.drive_names  (only seeded if not already set by worker HTML)

   COMPATIBILITY
     - Pure vanilla JS, no dependencies (no jQuery, no Bootstrap, no marked).
     - Compatible with shell.js which reads window.GDIUser.state,
       window.gdiListAllFiles(path, pw), window.drive_names, window.gdiGetPw().
     - All functions standalone — no closure vars from app.min.js needed.

   SIZE BUDGET: ~30KB (vs 165KB combined originals).
   ════════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1 — TINY HELPERS (esc, lsGet, lsSet, uid, today, formatFileSize, …)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * esc(s) — minimal HTML escaper for safe text insertion.
   * Same character set as the legacy `esc` used in app.min.js render strings.
   * For attribute values, prefer escHtml (adds quote escaping).
   */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * escHtml(s) — full HTML escaper including single & double quotes.
   * Use for any value inserted into an HTML attribute (title="", data-x="…")
   * or text node where attackers might inject markup.
   * Source: app.min.js line 17.
   */
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * escJs(s) — escape a string for safe inclusion inside a JS single-quoted
   * literal (used by worker HTML templates that JSON.parse('…')).
   * Source: app.min.js line 19.
   */
  function escJs(s) {
    return String(s == null ? '' : s)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/</g, '\\x3c');
  }

  /**
   * lsGet(key, def) — read JSON from localStorage; returns def on miss/error.
   * Safe against: quota errors, private mode (localStorage null), bad JSON,
   * and plain string values (returns the raw string if JSON.parse fails).
   */
  function lsGet(key, def) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return def;
      try { return JSON.parse(raw); }
      catch (_) { return raw; }            // not JSON — return as-is (legacy)
    } catch (_) { return def; }
  }

  /**
   * lsSet(key, val) — write val as JSON to localStorage; returns true on
   * success, false on quota/access errors (never throws).
   */
  function lsSet(key, val) {
    try {
      localStorage.setItem(key,
        typeof val === 'string' ? val : JSON.stringify(val));
      return true;
    } catch (_) { return false; }
  }

  /**
   * uid([prefix]) — short unique ID generator.
   * Format: `${prefix}_${timestamp_base36}${counter_base36}${random_base36}`.
   * Collisions practically impossible within a session (counter + random).
   */
  let _uidCounter = 0;
  function uid(prefix) {
    _uidCounter = (_uidCounter + 1) % 1296;       // 36^2
    const t = Date.now().toString(36);
    const c = _uidCounter.toString(36).padStart(2, '0');
    const r = Math.floor(Math.random() * 46656).toString(36);  // 36^3
    return (prefix || 'id') + '_' + t + c + r;
  }

  /**
   * today() — local date string in YYYY-MM-DD (for streak/daily-quest keys).
   * Uses local time (not UTC) because the user perceives a "day" locally.
   */
  function today() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }

  /**
   * formatFileSize(bytes) — human-readable file size (B/KB/MB/GB/TB).
   * Source: app.min.js line 1393. Returns '' for non-numeric or negative.
   */
  function formatFileSize(b) {
    const n = Number(b);
    if (isNaN(n) || n < 0) return '';
    if (n >= 1099511627776) return (n / 1099511627776).toFixed(2) + ' TB';
    if (n >= 1073741824)    return (n / 1073741824).toFixed(2) + ' GB';
    if (n >= 1048576)       return (n / 1048576).toFixed(2) + ' MB';
    if (n >= 1024)          return (n / 1024).toFixed(2) + ' KB';
    if (n > 1)              return n + ' bytes';
    if (n === 1)            return '1 byte';
    return '0 bytes';
  }

  /** sleep(ms) — promise-based delay. Source: app.min.js line 67. */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /**
   * gdiOkPath(p) — true if path is a usable app path (not /fallback, not null).
   * Used by GDIUser to skip persisting garbage last/history entries.
   * Source: app.min.js line 55.
   */
  function gdiOkPath(p) {
    return typeof p === 'string'
      && p.startsWith('/')
      && p !== '/fallback'
      && !p.startsWith('/fallback::')
      && !p.startsWith('/fallback#');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2 — Bus (event bus, page/global scopes)
  // Source: app.min.js lines 21–41
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Bus — minimal pub/sub event bus.
   *   on(e, fn)        — subscribe (page-scoped; cleared by reset())
   *   onGlobal(e, fn)  — subscribe (global; survives reset())
   *   off(e, fn)       — unsubscribe a page-scoped listener
   *   offGlobal(e, fn) — unsubscribe a global listener
   *   reset()          — remove ALL page-scoped listeners (call on route change)
   *   emit(e, ...args) — fire an event; errors in listeners are caught + logged
   *
   * shell.js currently uses Bus only as a "ready" signal (typeof Bus !== 'undefined'),
   * but the full GDIndex modules (lazy-loaded later) WILL register listeners
   * the moment they boot — so the API surface must match app.min.js exactly.
   */
  const Bus = (function () {
    const _map = new Map();                    // event → [{f, scope}]

    function _add(evt, fn, scope) {
      if (!_map.has(evt)) _map.set(evt, []);
      _map.get(evt).push({ f: fn, scope: scope });
    }

    function _off(evt, fn, scope) {
      const arr = _map.get(evt);
      if (!arr) return;
      const i = arr.findIndex(x => x.f === fn && x.scope === scope);
      if (i >= 0) arr.splice(i, 1);
    }

    return {
      on(e, f)        { _add(e, f, 'page'); },
      onGlobal(e, f)  { _add(e, f, 'global'); },
      off(e, f)       { _off(e, f, 'page'); },
      offGlobal(e, f) { _off(e, f, 'global'); },
      reset() {
        for (const arr of _map.values()) {
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].scope === 'page') arr.splice(i, 1);
          }
        }
      },
      emit(e) {
        const arr = _map.get(e);
        if (!arr) return;
        const args = Array.prototype.slice.call(arguments, 1);
        // iterate over a snapshot so a listener can off() itself safely
        arr.slice().forEach(function (x) {
          try { x.f.apply(null, args); }
          catch (err) { console.error('[Bus]', e, err); }
        });
      }
    };
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3 — GDIStorage (lean fetch wrapper with LRU cache)
  // Source: storage.js — kept ONLY memo + get + post + invalidate + fetchWithTimeout.
  // The 25+ named endpoints (isaCache, saveMaterial, listCourses, battalion, …)
  // are NOT needed by the shell and stay in the full storage.js for the GDIndex.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GDIStorage — minimal HTTP + memoization layer for /api/* and /userstate.
   *
   * Exposed surface (matches shell.js needs; future modules can still use the
   * full storage.js which will overlay these methods if loaded later):
   *   get(url, {ttlMs, raw})   → Promise<any>      (memoized GET, JSON by default)
   *   post(url, body, {raw})   → Promise<any>      (POST JSON, invalidates prefix)
   *   fetchWithTimeout(url, opts, ms) → Promise<Response>  (AbortController helper)
   *   invalidate(keyPrefix?)   → void               (clear all or matching entries)
   *   clearCache()             → void               (alias for invalidate())
   *   memo(key, ttlMs, fn)     → Promise<any>       (exposed for advanced callers)
   *   version                  → 'shell-lean-v1'
   *
   * LRU: 200-entry cap (matches storage.js _MEM_MAX). Map preserves insertion
   * order; on hit, entry is moved to MRU position (delete+set). Eviction is
   * the oldest (first key) when cap exceeded.
   */
  const GDIStorage = (function () {
    const VERSION = 'shell-lean-v1';

    const _mem = new Map();                    // key → { t, p }
    const _MEM_MAX = 200;                      // LRU cap

    /**
     * memo(key, ttlMs, fn) — read-through cache.
     * - Cache hit within TTL → returns cached promise (and bumps to MRU).
     * - Cache miss / expired → calls fn(), caches its promise, evicts LRU if full.
     * - If fn() rejects, the entry is purged so the next call retries cleanly.
     */
    function memo(key, ttlMs, fn) {
      const ent = _mem.get(key);
      const now = Date.now();
      if (ent && now - ent.t < ttlMs) {
        // LRU bump: delete + re-insert at tail (most-recently-used position).
        _mem.delete(key);
        _mem.set(key, ent);
        return ent.p;
      }
      if (ent && ent.p) _mem.delete(key);     // expired — purge before re-fetch
      const p = fn().catch(function (err) {
        _mem.delete(key);
        throw err;
      });
      _mem.set(key, { t: now, p: p });
      if (_mem.size > _MEM_MAX) {
        _mem.delete(_mem.keys().next().value); // evict oldest (LRU)
      }
      return p;
    }

    /** invalidate(keyPrefix?) — clear all entries, or only those starting with prefix. */
    function invalidate(keyPrefix) {
      if (!keyPrefix) { _mem.clear(); return; }
      for (const k of Array.from(_mem.keys())) {
        if (k.indexOf(keyPrefix) === 0) _mem.delete(k);
      }
    }

    /**
     * fetchWithTimeout(url, opts, timeoutMs) — fetch with AbortController.
     * Default 10s timeout. Source: storage.js lines 78–86.
     * Used by gdiListAllFiles below.
     */
    async function fetchWithTimeout(url, opts, timeoutMs) {
      const ctrl = new AbortController();
      const to = setTimeout(function () { ctrl.abort(); }, timeoutMs || 10000);
      try {
        return await fetch(url, Object.assign({}, opts || {}, { signal: ctrl.signal }));
      } finally {
        clearTimeout(to);
      }
    }

    /**
     * get(url, {ttlMs, raw}) — memoized GET.
     * Returns parsed JSON by default; pass raw:true to get the Response object.
     * Default TTL 30s (covers most "list" endpoints).
     */
    function get(url, opts) {
      opts = opts || {};
      const ttl = opts.ttlMs != null ? opts.ttlMs : 30000;
      return memo('GET:' + url, ttl, async function () {
        const r = await fetchWithTimeout(url, { method: 'GET' }, 15000);
        if (!r.ok) throw new Error('GET ' + url + ' failed: ' + r.status);
        if (opts.raw) return r;
        return await r.json();
      });
    }

    /**
     * post(url, body, {raw, invalidatePrefix}) — POST JSON; never memoized.
     * By default invalidates the GET cache for the same URL (so a follow-up
     * get() re-fetches). Pass invalidatePrefix:'foo' to clear a broader range.
     */
    async function post(url, body, opts) {
      opts = opts || {};
      const r = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body == null ? {} : body)
      }, 20000);
      if (!r.ok) throw new Error('POST ' + url + ' failed: ' + r.status);
      if (opts.invalidatePrefix) invalidate(opts.invalidatePrefix);
      else invalidate('GET:' + url);
      if (opts.raw) return r;
      try { return await r.json(); }
      catch (_) { return null; }              // some endpoints return empty body
    }

    return {
      version: VERSION,
      memo: memo,
      get: get,
      post: post,
      fetchWithTimeout: fetchWithTimeout,
      invalidate: invalidate,
      clearCache: function () { invalidate(); }
    };
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4 — GDIUser (user state via /userstate + /userstate/save)
  // Source: app.min.js lines 1412–1580 — adapted for shell (no jQuery/showToast dep)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GDIUser — per-user progress state (watched, resume, notes, history, srs).
   *
   * Persistence model:
   *   - GET  /userstate          → current state JSON (or redirect to /login)
   *   - POST /userstate/save     → write merged state
   *   - Debounced 5s after a mutation; re-fetch from server every 5min
   *   - visibilitychange (tab hide) triggers immediate flush
   *
   * Schema (SCHEMA=4): { v, watched, last, resume, notes, history, intro, srs }
   *   - watched: { [path]: { at } }       — set of watched video paths
   *   - resume:  { [path]: { t, d, at } } — playback position (time, duration, at)
   *   - notes:   { [path]: [{t,text,at}] }
   *   - history: [{ path, name, at }]     — last 12 visited pages
   *   - srs:     { [cardId]: { box, due } }
   *   - intro:   { [key]: seconds }
   *
   * The shell only READS state (Home "Continue assistindo"), so the heavy
   * mutation surface is preserved verbatim for the future full-app modules.
   */
  const GDIUser = (function () {
    const SCHEMA = 4;
    const EMPTY = {
      v: SCHEMA, watched: {}, last: null, resume: {},
      notes: {}, history: [], intro: {}, srs: {}
    };
    const MAX_RESUME = 300, MAX_HISTORY = 12, MAX_SRS = 1500;

    let state = null;             // current merged state
    let loaded = false;
    let saveTimer = null;
    let ops = [];                 // pre-load mutations queued
    let flushWarned = false;
    let auth = 'unknown';         // 'in' | 'out' | 'unknown'
    let _inflightFlush = null;
    const touched = new Set();    // dirty keys for merge-on-save

    const clone = function (o) { return JSON.parse(JSON.stringify(o || {})); };
    const _norm = function (p) { return String(p || '').split('?')[0]; };
    const _full = function (p) { return String(p || '').split('#')[0]; };

    /** migrate(s) — bump schema version forward, filling missing fields. */
    function migrate(s) {
      let v = (s && Number(s.v)) || 1;
      while (v < SCHEMA) {
        v++;
        if (v === 2) {
          s.watched = s.watched || {}; s.resume = s.resume || {};
          s.notes = s.notes || {}; s.last = s.last || null;
        }
        if (v === 3) { s.history = Array.isArray(s.history) ? s.history : []; }
        if (v === 4) { s.intro = s.intro || {}; s.srs = s.srs || {}; }
      }
      s.v = v;
      return s;
    }

    /** sanitizePaths(st) — drop any last/history entry pointing to /fallback. */
    function sanitizePaths(st) {
      try {
        if (st.last && st.last.path && !gdiOkPath(st.last.path)) st.last = null;
        if (Array.isArray(st.history)) {
          st.history = st.history.filter(function (h) {
            return h && gdiOkPath(h.path);
          });
        }
      } catch (_) {}
    }

    /** prune(st) — keep resume dict bounded to MAX_RESUME entries (oldest first). */
    function prune(st) {
      const keys = Object.keys(st.resume);
      if (keys.length <= MAX_RESUME) return;
      keys.sort(function (a, b) {
        return (st.resume[a].at || 0) - (st.resume[b].at || 0);
      });
      keys.slice(0, keys.length - MAX_RESUME).forEach(function (k) {
        delete st.resume[k];
      });
    }

    /**
     * mergeInto(local, remote) — last-write-wins merge by `at` timestamp.
     * Notes use length-wins; history uses length-wins; intro/srs use union
     * with local precedence on conflict.
     */
    function mergeInto(local, remote) {
      const m = (typeof structuredClone === 'function')
        ? structuredClone(local) : clone(local);
      try {
        const newer = function (a, b) { return (Number(a) || 0) >= (Number(b) || 0); };
        if (remote.watched) for (const k in remote.watched) {
          const L = m.watched[k], R = remote.watched[k];
          if (R && (!L || newer(R.at, L.at))) m.watched[k] = R;
        }
        if (remote.resume) for (const k in remote.resume) {
          const L = m.resume[k], R = remote.resume[k];
          if (R && (!L || newer(R.at, L.at))) m.resume[k] = R;
        }
        if (remote.notes) for (const k in remote.notes) {
          if (touched.has('notes:' + k)) continue;
          const R = remote.notes[k] || [], L = m.notes[k] || [];
          if (R.length > L.length) m.notes[k] = R;
        }
        if (remote.last && gdiOkPath(remote.last.path)
            && (!m.last || newer(remote.last.at, m.last.at))) m.last = remote.last;
        if (Array.isArray(remote.history)
            && remote.history.length > (m.history || []).length) m.history = remote.history;
        if (remote.intro) m.intro = Object.assign({}, remote.intro, m.intro || {});
        if (remote.srs)   m.srs   = Object.assign({}, remote.srs,   m.srs   || {});
        sanitizePaths(m);
      } catch (_) {}
      return m;
    }

    /**
     * _load() — fetch /userstate, migrate, sanitize, replay queued ops,
     * emit auth:change + user:ready. Returns Promise<void>.
     */
    async function _load() {
      let s = {}, ok = false;
      try {
        const r = await fetch('/userstate', { cache: 'no-store' });
        if (r.ok && !(r.redirected && /login/i.test(r.url || ''))) {
          s = await r.json(); ok = true;
        }
      } catch (_) {}
      if (!s || typeof s !== 'object') s = {};
      auth = ok ? 'in' : 'out';
      state = Object.assign(clone(EMPTY), s);
      migrate(state);
      sanitizePaths(state);
      ops.forEach(function (op) {
        try { op.fn(state); } catch (_) {}
        (op.tags || []).forEach(function (t) { touched.add(t); });
      });
      ops = [];
      loaded = true;
      schedule();
      Bus.emit('auth:change', auth);
      Bus.emit('user:ready');
    }

    /** mut(fn, tags) — apply a mutation now (if loaded) or queue it. */
    function mut(fn, tags) {
      if (loaded) {
        try { fn(state); } catch (_) {}
        (tags || []).forEach(function (t) { touched.add(t); });
        schedule();
      } else {
        ops.push({ fn: fn, tags: tags });
      }
    }

    /** schedule() — debounce save 5s after the last mutation. */
    function schedule() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(_flush, 5000);
    }

    /**
     * _flush() — merge remote (every 5min) + POST current state.
     * Deduplicates concurrent calls via _inflightFlush.
     */
    function _flush() {
      if (_inflightFlush) return _inflightFlush;
      _inflightFlush = (async function () {
        if (!loaded || !state) return;
        if (Date.now() - (state._lastRemote || 0) > 5 * 60 * 1000) {
          try {
            const r = await fetch('/userstate', { cache: 'no-store' });
            if (r.ok) {
              const remote = await r.json();
              if (remote && typeof remote === 'object') {
                state = mergeInto(state, remote);
              }
              state._lastRemote = Date.now();
            }
          } catch (_) {}
        }
        try {
          await fetch('/userstate/save', {
            method: 'POST',
            keepalive: true,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
          });
          touched.clear();
          flushWarned = false;
        } catch (_) {
          if (!flushWarned) {
            flushWarned = true;
            try { console.warn('[GDIUser] flush failed — will retry on next mutation'); }
            catch (_) {}
          }
        }
      })();
      const p = _inflightFlush;
      p.finally(function () { if (_inflightFlush === p) _inflightFlush = null; });
      return p;
    }

    return {
      /**
       * ready() — load user state from server (idempotent across calls).
       * Returns Promise that resolves once state is loaded; subsequent calls
       * return immediately-resolved Promise (window.__gdiUserReady guard).
       */
      ready: function () {
        if (window.__gdiUserReady) return Promise.resolve();
        window.__gdiUserReady = true;
        return _load();
      },
      SCHEMA: SCHEMA,
      loaded: function () { return loaded; },
      auth:   function () { return auth; },
      state:  null,        // ← set below once `state` is loaded (kept null at first
                           //   for safe `window.GDIUser.state || {}` access in shell.js)

      /** State accessor (shell.js reads window.GDIUser.state directly). */
      getState: function () { return loaded ? state : null; },

      // Watched (set of paths)
      markWatched:   function (p) { const k = _norm(p); mut(function (s) { s.watched[k] = { at: Date.now() }; }, ['watched:' + k]); },
      unmarkWatched: function (p) { const k = _norm(p); mut(function (s) { delete s.watched[k]; }, ['watched:' + k]); },
      isWatched:     function (p) { return !!(loaded && state.watched && state.watched[_norm(p)]); },

      // Last visited
      setLast:  function (p) { mut(function (s) { s.last = { path: _full(p), at: Date.now() }; }, ['last']); },
      getLast:  function () { return (loaded && state.last) || null; },

      // Resume (playback position)
      setResume: function (p, t, d) {
        const k = _norm(p); if (!k) return;
        mut(function (s) {
          s.resume[k] = { t: Math.floor(t), d: Math.floor(d || 0), at: Date.now() };
          prune(s);
        }, ['resume:' + k]);
      },
      getResume: function (p) {
        const k = _norm(p);
        return (loaded && state.resume && state.resume[k]) || null;
      },
      delResume: function (p) {
        const k = _norm(p);
        mut(function (s) { delete s.resume[k]; }, ['resume:' + k]);
      },

      // Notes
      addNote: function (p, t, text) {
        const k = _norm(p);
        mut(function (s) {
          s.notes[k] = s.notes[k] || [];
          s.notes[k].push({ t: Math.floor(t || 0), text: String(text).slice(0, 2000), at: Date.now() });
        }, ['notes:' + k]);
      },
      delNote: function (p, i) {
        const k = _norm(p);
        mut(function (s) { if (s.notes[k]) s.notes[k].splice(i, 1); }, ['notes:' + k]);
      },
      getNotes: function (p) {
        const k = _norm(p);
        return (loaded && state.notes && state.notes[k]) || [];
      },

      // Intro dismissed-seconds (UX hint)
      getIntro: function (k) { return (loaded && state.intro && state.intro[k]) || 0; },
      setIntro: function (k, sec) {
        if (!k || !(sec > 0)) return;
        mut(function (s) { s.intro[k] = Math.floor(sec); }, ['intro']);
      },

      // Spaced-repetition (flashcards)
      srsGrade: function (id, good) {
        if (!id) return;
        mut(function (s) {
          s.srs = s.srs || {};
          if (good) {
            const nb = ((s.srs[id] && s.srs[id].box) || 0) + 1;
            if (nb > 3) delete s.srs[id];
            else s.srs[id] = { box: nb, due: Date.now() + [1, 7, 30][nb - 1] * 86400000 };
          } else {
            s.srs[id] = { box: 0, due: Date.now() + 86400000 };
          }
          const ks = Object.keys(s.srs);
          if (ks.length > MAX_SRS) {
            ks.sort(function (a, b) { return (s.srs[a].due || 0) - (s.srs[b].due || 0); })
              .slice(0, ks.length - MAX_SRS)
              .forEach(function (k) { delete s.srs[k]; });
          }
        }, ['srs']);
      },

      // History (last 12 visited pages)
      pushHistory: function (p, name) {
        const k = _full(p);
        if (!gdiOkPath(k)) return;
        mut(function (s) {
          s.history = (s.history || []).filter(function (h) { return h.path !== k; });
          s.history.unshift({ path: k, name: String(name || '').slice(0, 120), at: Date.now() });
          if (s.history.length > MAX_HISTORY) s.history.length = MAX_HISTORY;
        }, ['history']);
      },

      /** dump() — return a snapshot of state (or null if not loaded). */
      dump: function () {
        if (!loaded) return null;
        return {
          watched: state.watched, resume: state.resume, notes: state.notes,
          last: state.last, history: state.history || [], srs: state.srs || {}
        };
      },

      /** flush() — force-save now (e.g. on tab hide). */
      flush: _flush
    };
  })();

  // Kick off load immediately, and flush on tab hide. Both are safe no-ops
  // if /userstate is unreachable (auth='out', state stays as EMPTY).
  try { GDIUser.ready(); } catch (_) {}
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { try { GDIUser.flush(); } catch (_) {} }
    });
  } catch (_) {}                            // non-browser (node --check) — ignore

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5 — gdiListAllFiles(path, pw, onPage)  (folder listing)
  // Source: app.min.js lines 77–113 (PATCH D cache kept, simpler abort handling)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * gdiListAllFiles(path, pw, onPage) — list all files in a Drive folder.
   *   path   — full GDIndex folder path (e.g. "/0:/" or "/0:/folder/subfolder/")
   *   pw     — password (optional; usually '' for public drives)
   *   onPage — optional callback(accumulatedFiles) fired after each page
   *
   * Returns: Promise<Array<{ name, mimeType, id, size, modifiedTime, link }>>
   *   - `link` is synthesized as `path + encodeURIComponent(name)` — the same
   *     URL the GDIndex player understands. shell.js uses it to open videos.
   *
   * Pagination: up to 50 pages, 30s timeout per request (AbortController).
   * Cache: LRU 50 entries, TTL 5min (PATCH D from app.min.js, preserved).
   * On error: logs + returns [] (never rejects — shell.js doesn't need to .catch).
   */
  const _listCache = new Map();
  const LIST_TTL = 5 * 60 * 1000;
  const LIST_MAX = 50;

  function _listCacheGet(k) {
    const e = _listCache.get(k);
    if (!e) return null;
    if (Date.now() - e.at > LIST_TTL) { _listCache.delete(k); return null; }
    // LRU bump
    _listCache.delete(k);
    _listCache.set(k, e);
    return e.files;
  }

  function _listCacheSet(k, f) {
    if (_listCache.size >= LIST_MAX) {
      _listCache.delete(_listCache.keys().next().value);
    }
    _listCache.set(k, { at: Date.now(), files: f.slice() });
  }

  async function gdiListAllFiles(path, pw, onPage) {
    try {
      const key = path + '|' + (pw || '');
      const cached = _listCacheGet(key);
      if (cached) {
        if (onPage) { try { onPage(cached.slice()); } catch (_) {} }
        return cached.slice();
      }
      const out = [];
      let token = '', idx = 0;
      for (let guard = 0; guard < 50; guard++) {
        let page = null;
        try {
          const r = await GDIStorage.fetchWithTimeout(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: '', type: 'folder',
              password: pw || '',
              page_token: token,
              page_index: idx
            })
          }, 30000);
          if (r.ok) page = await r.json();
        } catch (_) {}
        const files = page && page.data && Array.isArray(page.data.files)
          ? page.data.files : null;
        if (!files) break;

        // Push in 1k-chunks to avoid stack overflow on spread of huge arrays.
        for (let i = 0; i < files.length; i += 1000) {
          const chunk = files.slice(i, i + 1000);
          for (let j = 0; j < chunk.length; j++) out.push(chunk[j]);
        }
        if (onPage) { try { onPage(out); } catch (_) {} }
        if (!page.nextPageToken) break;
        token = page.nextPageToken;
        idx++;
      }
      _listCacheSet(key, out);
      return out;
    } catch (err) {
      console.error('[gdi-utils] gdiListAllFiles erro:', path, err);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6 — Password helpers (stubs; replaced by gdi-extras.js if loaded)
  // Source: app.min.js lines 69–71
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * gdiGetPw() / gdiSetPw() — stubs replaced by gdi-extras.js password-safe
   * module when the full GDIndex loads. shell.js calls window.gdiGetPw() to
   * get the password for gdiListAllFiles(); '' means "no password" which is
   * correct for all 12 staging drives (protect_file_link: false everywhere).
   */
  function gdiGetPw() { return ''; }
  function gdiSetPw() { /* no-op stub */ }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7 — drive_names (12 staging drives, only seeded if missing)
  // Source: worker-staging.js authConfig.roots (lines 173–186)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * drive_names — 12-drive list (Meggy staging authConfig.roots).
   * The worker HTML injects `window.drive_names = JSON.parse('…')` BEFORE any
   * <script> loads, so we DO NOT overwrite if it's already set. This fallback
   * only fires in dev/test environments where the worker HTML didn't run.
   */
  const DEFAULT_DRIVE_NAMES = [
    'RETA FINAL TRTs',
    'CURSOS - PLATAFORMAS COMPLETAS',
    'VESTIBULARES PLATAFORMAS',
    'VESTIBULARES ISOLADAS',
    'MUSICA E CANTO',
    'CARREIRAS EDUCACIONAIS',
    'CLUBE FIT',
    'HIPOPRESSIVOS',
    'SAÚDE E MEDICINA',
    'TUDO DE TRIBUNAIS',
    'ALFACON 2026',
    'PREPARATÓRIO OAB'
  ];

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8 — EXPORTS (all on window)
  // ═══════════════════════════════════════════════════════════════════════════

  // Bind GDIUser.state lazily — shell.js reads `window.GDIUser.state` and
  // expects either null or the live state object. We expose it as a getter
  // so it always reflects the current loaded state (instead of a stale ref).
  try {
    Object.defineProperty(GDIUser, 'state', {
      configurable: true,
      enumerable: true,
      get: function () { return GDIUser.getState(); }
    });
  } catch (_) {
    // Non-browser or no defineProperty — fallback: leave state as null;
    // shell.js already uses `(window.GDIUser && window.GDIUser.state) || {}`.
  }

  // Only seed drive_names if worker HTML didn't already set it.
  if (typeof window !== 'undefined' && !window.drive_names) {
    window.drive_names = DEFAULT_DRIVE_NAMES;
  }

  // Export everything
  try {
    window.Bus             = Bus;
    window.GDIStorage      = GDIStorage;
    window.GDIUser         = GDIUser;
    window.gdiListAllFiles = gdiListAllFiles;
    window.gdiGetPw        = gdiGetPw;
    window.gdiSetPw        = gdiSetPw;
    window.esc             = esc;
    window.escHtml         = escHtml;
    window.escJs           = escJs;
    window.lsGet           = lsGet;
    window.lsSet           = lsSet;
    window.uid             = uid;
    window.today           = today;
    window.formatFileSize  = formatFileSize;
    window.sleep           = sleep;
    window.gdiOkPath       = gdiOkPath;
  } catch (_) {
    // Non-browser (node --check) — exports are no-ops, syntax is what matters.
  }

  console.log('[gdi-utils] loaded — Bus, GDIStorage (lean), GDIUser, gdiListAllFiles, helpers');
})();
