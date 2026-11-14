// ═══════════════════════════════════════════════════════════════
// meggy-md.js — Renderer Markdown vendored (sem dependência externa)
// v2.15.5 item 10 (ordem do Elton 23:59): MD renderizado de verdade nos
// SITES — transcrições, resumos da Meggy (aba Resumo / view de resumos /
// ISA), chat da Meggy — em vez de texto cru com # e *.
//
// Por que vendored e não só marked via CDN?
//   marked@12 + DOMPurify@3 já existem via jsDelivr e CONTINUAM sendo o
//   caminho primário quando carregam. Mas quando o CDN falha (offline,
//   jsDelivr defasado/bloqueado), TODOS os renderMd() caíam para
//   esc+<br> — o usuário via o MD cru. Este módulo é o fallback
//   garantido: mesma origem (/modular/), sem rede extra, e seguro por
//   construção (escapa ANTES de parsear — nenhum HTML do conteúdo
//   sobrevive: <script>, <img onerror>, onclick, javascript: etc.
//   viram texto). Também substitui os fallbacks regex SEM escape de
//   shell.js (_downloadMdAsPdf / _downloadIsaAsPdf / meggyAIAction),
//   que inseriam o texto cru no HTML (XSS se o resumo/transcrição
//   contivesse tag).
//
// Suporte: h1–h6, parágrafos, hr, listas ul/ol aninhadas, tabelas GFM
// (com alinhamento), code fence com linguagem + inline code, blockquote
// (inclusive aninhado), negrito/itálico/tachado, links (http/https/
// mailto) e autolinks. Imagens ![alt](src) viram LINK (não <img>): o
// conteúdo vem de transcrição/PDF/IA e não deve carregar URL arbitrária.
//
// Uso: window.gdiRenderMd(md) → string HTML segura ('' p/ MD vazio).
// Também expõe window.__gdiMeggy.md = { render, renderMd, stripMd }.
// stripMd(md) → texto puro (p/ TTS/meta — o TTS tem higienização
// própria em meggy-tts.js e NÃO depende daqui).
// ═══════════════════════════════════════════════════════════════
(function(){
  'use strict';

  // ── Escape HTML (sempre antes de qualquer parse) ──
  function esc(s){
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Inline: opera sobre texto ESCAPADO; só emite tags seguras ──
  // Code spans são extraídos primeiro (placeholders \0N\0) para que
  // nenhum marcador dentro deles seja interpretado.
  function inline(raw){
    var codes = [];
    var s = String(raw == null ? '' : raw);
    s = s.replace(/`([^`\n]+)`/g, function(m, c){
      codes.push('<code>' + esc(c) + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    s = esc(s);
    // Autolinks <https://...> / <mailto:...>
    s = s.replace(/&lt;(https?:\/\/[^<>\s]+|mailto:[^<>\s]+)&gt;/gi, function(m, u){
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>';
    });
    // Imagens → link (nunca <img>)
    s = s.replace(/!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*?&quot;)?\)/g, function(m, alt, url){
      if (!/^(https?:\/\/|mailto:)/i.test(url) || /[*`<>]/.test(url)) return m;
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + (alt || url) + '</a>';
    });
    // Links [texto](url) — só http/https/mailto; resto vira texto literal
    s = s.replace(/\[([^\]\n]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*?&quot;)?\)/g, function(m, text, url){
      if (!/^(https?:\/\/|mailto:)/i.test(url) || /[*`<>]/.test(url)) return m;
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + (text || url) + '</a>';
    });
    // Negrito **x** e __x__
    s = s.replace(/\*\*([^\n*]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_\n]+?)__/g, '<strong>$1</strong>');
    // Tachado ~~x~~
    s = s.replace(/~~([^~\n]+?)~~/g, '<del>$1</del>');
    // Itálico *x* e _x_ (underscore só fora de palavra: evita snake_case)
    s = s.replace(/\*([^\n*]+?)\*/g, '<em>$1</em>');
    s = s.replace(/(^|\W)_([^_\n]+?)_(?=\W|$)/g, '$1<em>$2</em>');
    // Restaura code spans
    s = s.replace(/\u0000(\d+)\u0000/g, function(m, n){ return codes[+n] || ''; });
    return s;
  }

  // ── Blocos ──
  function isBlank(l){ return /^\s*$/.test(l); }
  function headingMatch(l){
    var m = l.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    return m ? { level: m[1].length, text: m[2] } : null;
  }
  function isHr(l){ return /^\s*([-*_])(\s*\1){2,}\s*$/.test(l); }
  function fenceMatch(l){
    var m = l.match(/^\s*```(\S*)\s*$/);
    return m ? m[1] : null;
  }
  function listMatch(l){
    var m = l.match(/^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/);
    if (!m) return null;
    return { indent: m[1].replace(/\t/g, '    ').length,
             ordered: /\d/.test(m[2][0]), marker: m[2], text: m[3] };
  }
  function quoteMatch(l){
    var m = l.match(/^\s*>\s?(.*)$/);
    return m ? m[1] : null;
  }
  function splitRow(l){
    var t = String(l).trim();
    if (t.charAt(0) === '|') t = t.slice(1);
    if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
    return t.split('|').map(function(c){ return c.replace(/\\\|/g, '|').trim(); });
  }
  function isSepRow(l){
    var cells = splitRow(l);
    if (!cells.length) return false;
    return cells.every(function(c){ return /^\s*:?-{3,}:?\s*$/.test(c); });
  }
  function cellAlign(c){
    var t = String(c).trim();
    var left = t.charAt(0) === ':', right = t.charAt(t.length - 1) === ':';
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return '';
  }

  // Renderiza um array de linhas em HTML. Recursivo (blockquote, itens).
  function renderBlocks(lines){
    var out = [], i = 0;
    while (i < lines.length){
      var l = lines[i];
      if (isBlank(l)){ i++; continue; }

      // Code fence
      var lang = fenceMatch(l);
      if (lang !== null){
        var buf = [];
        i++;
        while (i < lines.length && fenceMatch(lines[i]) === null){ buf.push(lines[i]); i++; }
        if (i < lines.length) i++; // fecha o fence
        var cls = lang.replace(/[^A-Za-z0-9+#_-]/g, '');
        out.push('<pre><code' + (cls ? ' class="language-' + esc(cls) + '"' : '') + '>' +
          esc(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // Heading
      var h = headingMatch(l);
      if (h){
        out.push('<h' + h.level + '>' + inline(h.text) + '</h' + h.level + '>');
        i++;
        continue;
      }

      // HR
      if (isHr(l)){ out.push('<hr>'); i++; continue; }

      // Tabela GFM: linha com | seguida de linha separadora ---.
      // Sem a separadora, NÃO é tabela (vira parágrafo — "tabela sem
      // cabeçalho" não inventa <table>).
      if (l.indexOf('|') !== -1 && i + 1 < lines.length && isSepRow(lines[i + 1])){
        var head = splitRow(l);
        var aligns = splitRow(lines[i + 1]).map(cellAlign);
        var rows = [];
        i += 2;
        while (i < lines.length && !isBlank(lines[i]) && lines[i].indexOf('|') !== -1){
          rows.push(splitRow(lines[i])); i++;
        }
        var th = head.map(function(c, k){
          var a = aligns[k] ? ' align="' + aligns[k] + '"' : '';
          return '<th' + a + '>' + inline(c) + '</th>';
        }).join('');
        var tb = rows.map(function(r){
          var tds = head.map(function(_, k){
            var a = aligns[k] ? ' align="' + aligns[k] + '"' : '';
            return '<td' + a + '>' + inline(r[k] == null ? '' : r[k]) + '</td>';
          }).join('');
          return '<tr>' + tds + '</tr>';
        }).join('');
        out.push('<table><thead><tr>' + th + '</tr></thead><tbody>' + tb + '</tbody></table>');
        continue;
      }

      // Blockquote (consecutivo; aninhado via recursão)
      var q = quoteMatch(l);
      if (q !== null){
        var qbuf = [];
        while (i < lines.length){
          var q2 = quoteMatch(lines[i]);
          if (q2 === null) break;
          qbuf.push(q2); i++;
        }
        out.push('<blockquote>' + renderBlocks(qbuf) + '</blockquote>');
        continue;
      }

      // Lista (ul/ol, aninhada via recursão nos itens)
      var lm = listMatch(l);
      if (lm){
        var res = renderList(lines, i);
        out.push(res.html);
        i = res.next;
        continue;
      }

      // Parágrafo: linhas até branco ou início de outro bloco.
      // Quebra simples de linha vira <br> (transcrições dependem disso).
      var pbuf = [l];
      i++;
      while (i < lines.length && !isBlank(lines[i])
        && headingMatch(lines[i]) === null && fenceMatch(lines[i]) === null
        && !isHr(lines[i]) && quoteMatch(lines[i]) === null
        && listMatch(lines[i]) === null
        && !(lines[i].indexOf('|') !== -1 && i + 1 < lines.length && isSepRow(lines[i + 1]))){
        pbuf.push(lines[i]); i++;
      }
      out.push('<p>' + pbuf.map(function(x){ return inline(x); }).join('<br>') + '</p>');
    }
    return out.join('\n');
  }

  // Lista a partir de lines[start]; devolve {html, next}.
  function renderList(lines, start){
    var first = listMatch(lines[start]);
    var base = first.indent;
    var tag = first.ordered ? 'ol' : 'ul';
    var items = []; // {marker, ordered, lines[]}
    var i = start;
    while (i < lines.length){
      var l = lines[i];
      if (isBlank(l)){
        // Branco só pertence à lista se a próxima não-branca for item
        // no mesmo nível ou continuação mais indentada.
        var j = i + 1;
        while (j < lines.length && isBlank(lines[j])) j++;
        if (j >= lines.length) break;
        var nm = listMatch(lines[j]);
        if (nm && nm.indent < base) break;
        if (!nm && lines[j].search(/\S/) <= base) break;
        i = j; continue;
      }
      var m = listMatch(l);
      if (m && m.indent === base){
        items.push({ ordered: m.ordered, marker: m.marker,
          markerLen: m.marker.length, lines: [m.text] });
        i++;
        continue;
      }
      if (m && m.indent > base){
        if (items.length) items[items.length - 1].lines.push(l);
        i++;
        continue;
      }
      if (!m && items.length && (l.search(/\S/) > base || /^\s*$/.test(l))){
        items[items.length - 1].lines.push(l);
        i++;
        continue;
      }
      break;
    }
    var lis = items.map(function(it){
      // Dedenta as linhas de continuação pelo recuo do conteúdo
      // (base + marcador + 1 espaço); a 1ª linha já é só conteúdo.
      var dedent = base + it.markerLen + 1;
      var src = [it.lines[0]].concat(it.lines.slice(1).map(function(x){
        var n = 0;
        while (n < dedent && n < x.length && x[n] === ' ') n++;
        return x.slice(n);
      }));
      var html = renderBlocks(src);
      // Lista "tight" (sem linha em branco dentro do item): o <p> inicial
      // é desnecessário — "<li>b<ul>…" em vez de "<li><p>b</p><ul>…".
      if (src.join('\n').indexOf('\n\n') === -1){
        var pm = html.match(/^<p>([\s\S]*?)<\/p>([\s\S]*)$/);
        if (pm) html = pm[1] + pm[2];
      }
      return '<li>' + html + '</li>';
    }).join('\n');
    return { html: '<' + tag + '>\n' + lis + '\n</' + tag + '>', next: i };
  }

  // ── Entrada principal ──
  function renderMd(md){
    if (md == null) return '';
    var src = String(md).replace(/\r\n?/g, '\n').replace(/\t/g, '    ');
    if (!src.trim()) return '';
    return renderBlocks(src.split('\n'));
  }
  renderMd.version = '2.15.5';

  // ── stripMd: MD → texto puro (sem HTML) ──
  function stripMd(md){
    var s = String(md == null ? '' : md);
    s = s.replace(/```[\s\S]*?```/g, ' ')
         .replace(/`([^`]*)`/g, '$1')
         .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
         .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
         .replace(/^#{1,6}\s+/gm, '')
         .replace(/^>\s?/gm, '')
         .replace(/^(\s*)([-*+]|\d+[.)])\s+/gm, '$1')
         .replace(/(\*\*|__)(.*?)\1/g, '$2')
         .replace(/(\*|_)(.*?)\1/g, '$2')
         .replace(/~~(.*?)~~/g, '$1')
         .replace(/\|/g, ' ')
         .replace(/^\s*:?-{3,}:?\s*$/gm, ' ')
         .replace(/[ \t]+/g, ' ')
         .replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  // ── Exports ──
  window.gdiRenderMd = renderMd;
  window.__gdiMeggy = window.__gdiMeggy || {};
  window.__gdiMeggy.md = { render: renderMd, renderMd: renderMd, stripMd: stripMd };
  try { console.log('[GDI] meggy-md ativo (renderer Markdown vendored v2.15.5)'); } catch(_){}
})();
