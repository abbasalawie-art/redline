// The words on the pages: finding them, covering and retyping them, and copying them out to Word.
import { icon } from './icons.js';
import { el } from './render-svg.js';
import { textPad } from './shapes.js';
import { LINE_HEIGHT, ASCENT } from './text.js';
import { clamp } from './geometry.js';
import { newId } from './tools.js';
import { docx, DOCX_MIME } from './office.js';

const r2 = n => Math.round(n * 100) / 100;

export function initSearch(app) {
  const { h } = app.ui, { pdfjs } = app;
  let cache = new Map();          // page index → [{ str, x, base, w, size, ang }] in page view units
  let results = [], at = -1, query = '';

  const bar = h('div', { id: 'findbar', class: 'stage-ui', hidden: true });
  app.el.stage.append(bar);

  function reset() { cache = new Map(); results = []; at = -1; query = ''; bar.hidden = true; app.el.found.textContent = ''; }

  async function itemsOf(i) {
    if (cache.has(i)) return cache.get(i);
    const doc = app.doc, list = [];
    const page = await doc.pdf.getPage(i + 1);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue;
      const t = pdfjs.Util.transform(vp.transform, it.transform);
      list.push({ str: it.str, x: t[4], base: t[5], w: it.width, size: Math.hypot(t[2], t[3]) || it.height || 10, ang: Math.atan2(t[1], t[0]) });
    }
    if (app.doc === doc) cache.set(i, list);
    return list;
  }

  /** Corners of the part of a text item between fractions a and b of its length. */
  function quad(it, a, b) {
    const ux = Math.cos(it.ang), uy = Math.sin(it.ang), nx = uy, ny = -ux;       // n points up from the baseline
    const pt = (s, v) => [it.x + ux * s * it.w + nx * v * it.size, it.base + uy * s * it.w + ny * v * it.size];
    return [pt(a, -0.24), pt(b, -0.24), pt(b, 0.86), pt(a, 0.86)];
  }

  // ---- find ---------------------------------------------------------------
  async function find(q, onProgress) {
    const doc = app.doc, needle = q.trim().toLowerCase();
    const out = [];
    if (needle) {
      for (let i = 0; i < doc.pageCount; i++) {
        const items = await itemsOf(i);
        if (app.doc !== doc) return [];
        items.forEach((it, k) => {
          const s = it.str.toLowerCase();
          for (let from = 0, idx; (idx = s.indexOf(needle, from)) >= 0; from = idx + needle.length) {
            out.push({ page: i, item: k, a: idx / s.length, b: (idx + needle.length) / s.length, text: it.str });
          }
        });
        if (onProgress && i % 4 === 3) onProgress(i + 1, doc.pageCount);
      }
    }
    return out;
  }

  function render() {
    const g = app.el.found;
    g.textContent = '';
    if (!app.doc || !results.length) return;
    const list = cache.get(app.doc.pageIndex);
    if (!list) return;
    results.forEach((r, i) => {
      if (r.page !== app.doc.pageIndex) return;
      const q = quad(list[r.item], r.a, r.b);
      g.appendChild(el('path', { d: `M${q.map(p => `${r2(p[0])} ${r2(p[1])}`).join('L')}Z`, class: i === at ? 'found now' : 'found' }));
    });
  }

  function paintBar() {
    bar.hidden = !results.length;
    bar.textContent = '';
    if (!results.length) return;
    bar.append(
      h('button', { class: 'tb icon', 'aria-label': 'Previous match', html: icon('prev'), onclick: () => show((at - 1 + results.length) % results.length) }),
      h('button', { class: 'findbar-label', onclick: open }, `“${query}”  ${at + 1} of ${results.length}`),
      h('button', { class: 'tb icon', 'aria-label': 'Next match', html: icon('next'), onclick: () => show((at + 1) % results.length) }),
      h('button', { class: 'tb icon', 'aria-label': 'Stop finding', html: icon('close'), onclick: () => { results = []; at = -1; render(); paintBar(); } }));
  }

  async function show(i) {
    at = i;
    const r = results[i];
    if (!r) return;
    if (r.page !== app.doc.pageIndex) await app.goPage(r.page); else render();
    const it = cache.get(r.page)[r.item], q = quad(it, r.a, r.b);
    const cx = (q[0][0] + q[2][0]) / 2, cy = (q[0][1] + q[2][1]) / 2;
    const st = app.el.stage.getBoundingClientRect(), v = app.viewer.view;
    const scale = Math.max(v.scale, Math.min(app.viewer.fitScale * 3, 26 / it.size));
    app.viewer.setView({ scale, tx: st.width / 2 - cx * scale, ty: st.height / 2 - cy * scale }, { settle: true });
    render();
    paintBar();
  }

  function open() {
    if (!app.doc) return;
    if (app.editing) app.commitEdit();
    const input = h('input', { type: 'search', class: 'line-in', placeholder: 'Word, room, circuit number…', value: query, 'aria-label': 'Find text', enterkeyhint: 'search' });
    const status = h('p', { class: 'muted' }, 'Type what you are looking for and press Find.');
    const list = h('div', { class: 'rows' });
    const paint = () => {
      list.textContent = '';
      results.slice(0, 300).forEach((r, i) => {
        const from = Math.round(r.a * r.text.length), to = Math.round(r.b * r.text.length);
        list.append(h('button', { class: 'rowbtn', onclick: () => { app.ui.closeSheet(); show(i); } },
          h('span', { class: 'row-n' }, `p ${r.page + 1}`),
          h('span', { class: 'row-main' }, r.text.slice(Math.max(0, from - 30), from), h('mark', {}, r.text.slice(from, to)), r.text.slice(to, to + 40))));
      });
    };
    const go = async () => {
      query = input.value.trim();
      if (!query) return;
      status.textContent = 'Looking…';
      results = await find(query, (done, of) => { status.textContent = `Looking… page ${done} of ${of}`; });
      at = -1;
      status.textContent = results.length ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}${results.length > 300 ? ', first 300 shown' : ''}.` : 'Nothing found. Words drawn as lines, and scanned pages, cannot be searched.';
      paint();
      render();
      paintBar();
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); go(); } });
    app.ui.openSheet('Find text', [
      h('div', { class: 'row tight' }, input, h('button', { class: 'btn primary slim', onclick: go }, 'Find')),
      status, list,
    ]);
    if (results.length) { status.textContent = `${results.length} ${results.length === 1 ? 'match' : 'matches'}.`; paint(); }
    setTimeout(() => input.focus(), 60);
  }

  // ---- cover and retype ---------------------------------------------------
  /** Tap on a line of text: put a white patch over it with the same words, ready to change. */
  async function retypeAt(p) {
    const page = app.doc.pageIndex, k = app.doc.pageInfo.k;
    const hits = (await itemsOf(page)).filter(it => Math.abs(it.ang) < 0.03 && p.x >= it.x - 2 && p.x <= it.x + it.w + 2 && p.y >= it.base - it.size && p.y <= it.base + it.size * 0.3);
    if (!hits.length) return app.ui.toast('No typed text there. Drag a box over it to cover it and type on top.');
    const it = hits.sort((a, b) => a.w * a.size - b.w * b.size)[0];
    const size = clamp(Math.round(it.size * 10) / 10, 4, 144);
    const text = app.font.clean(it.str.trim());
    const m = { id: newId(), page, type: 'text', k, color: '#111111', textColor: '#111111', fill: '#ffffff', border: false, width: k, opacity: 1, fontSize: size, text, box: null };
    const pad = textPad(m), lh = size * LINE_HEIGHT;
    m.box = { ax: it.x - pad, ay: it.base - ASCENT * size + lh / 2, align: 'l', w: null };
    // The patch has to hide all of the old words, even where Redline's own lettering runs narrower.
    m.box.w = Math.max(it.w, app.font.width(text, size)) + 2 * pad;
    app.pushUndo();
    app.markups.push(m);
    if (!app.lock) app.setTool('select');
    app.changed();
    app.select(m.id);
    app.startEdit(m, true);
  }

  /** Drag a box: a white patch the size of the box, and text to type on top of it. */
  function cover(rect) {
    const page = app.doc.pageIndex, k = app.doc.pageInfo.k;
    app.pushUndo();
    app.markups.push({ id: newId(), page, type: 'rect', k, color: '#ffffff', fill: '#ffffff', fillOpacity: 1, width: 0.5, opacity: 1, rect: { ...rect } });
    app.changed();
    const size = clamp(Math.min(12 * k, rect.h * 0.7), 5, 72);
    const m = { id: newId(), page, type: 'text', k, color: '#111111', textColor: '#111111', fill: null, border: false, width: k, opacity: 1, fontSize: size, text: '', box: null };
    const pad = textPad(m);
    m.box = { ax: rect.x, ay: rect.y + pad + (size * LINE_HEIGHT) / 2, align: 'l', w: Math.max(rect.w, size * 3) };
    app.pushUndo();
    app.markups.push(m);
    if (!app.lock) app.setTool('select');
    app.changed();
    app.select(m.id);
    app.startEdit(m, true);
  }

  // ---- text to Word -------------------------------------------------------
  /** One page's words as paragraphs, read left to right, top to bottom. */
  function paragraphs(items) {
    const flat = items.filter(it => Math.abs(it.ang) < 0.03).sort((a, b) => a.base - b.base || a.x - b.x);
    const lines = [];
    for (const it of flat) {
      const ln = lines[lines.length - 1];
      if (ln && Math.abs(ln.base - it.base) < Math.max(ln.size, it.size) * 0.45) ln.items.push(it);
      else lines.push({ base: it.base, size: it.size, items: [it] });
    }
    const paras = [];
    let prev = null;
    for (const ln of lines) {
      ln.items.sort((a, b) => a.x - b.x);
      let text = '', end = null;
      for (const it of ln.items) {
        if (end != null && it.x - end > it.size * 0.2 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += it.x - end > it.size * 2.5 ? '    ' : ' ';
        text += it.str;
        end = it.x + it.w;
      }
      text = text.replace(/\s+$/, '');
      if (!text) continue;
      if (prev && ln.base - prev.base < Math.max(prev.size, ln.size) * 1.7) paras[paras.length - 1] += `\n${text}`;
      else paras.push(text);
      prev = ln;
    }
    const turned = items.filter(it => Math.abs(it.ang) >= 0.03).map(it => it.str.trim()).filter(Boolean);
    if (turned.length) paras.push(turned.join('\n'));
    return paras;
  }

  async function textToWord() {
    const doc = app.doc;
    if (!doc) return;
    app.ui.closeSheet();
    app.ui.busy('Reading the words…');
    try {
      const title = doc.name.replace(/\.pdf$/i, '');
      const blocks = [{ h: title, level: 0 }, { p: 'Text copied out of the PDF by Redline. Layout, tables and pictures are not kept.', muted: true }];
      let words = 0;
      for (let i = 0; i < doc.pageCount; i++) {
        const paras = paragraphs(await itemsOf(i));
        if (doc.pageCount > 1) blocks.push({ h: `Page ${i + 1}`, level: 1 });
        for (const p of paras) { blocks.push({ p }); words += p.split(/\s+/).length; }
        if (!paras.length) blocks.push({ p: '(no text on this page)', muted: true });
      }
      app.ui.busy(null);
      if (!words) return app.ui.alert('No text to copy', 'This PDF has no typed text in it. Its words are drawn as lines, or it is a scan.');
      app.ui.deliver(docx(blocks, { title, author: app.prefs.author || 'Redline' }), app.exportName('text', 'docx'), DOCX_MIME, `${words} words from ${doc.pageCount} ${doc.pageCount === 1 ? 'page' : 'pages'}. Plain text only.`);
    } catch (e) {
      console.error(e);
      app.ui.busy(null);
      app.ui.alert('That did not work', 'The words could not be read from this PDF.');
    }
  }

  /** Step to the next or previous match, or open Find if nothing has been searched for yet. */
  const step = dir => (results.length ? show((at + dir + results.length) % results.length) : open());
  app.search = { reset, render, open, step, textToWord, itemsOf };
  app.retype = { at: retypeAt, cover };
}
