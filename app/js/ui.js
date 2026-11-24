// Everything around the drawing: tool rail, options bar, files, pages, export, settings.
import { icon } from './icons.js';
import { TEXT_TYPES } from './shapes.js';
import * as store from './store.js';

export const TOOLS = [
  ['select', 'Select'], ['cloud', 'Cloud'], ['cloudplus', 'Cloud+'], ['callout', 'Callout'], ['text', 'Text'],
  ['arrow', 'Arrow'], ['pen', 'Pen'], ['hl', 'Highlight'], ['rect', 'Box'], ['ellipse', 'Ellipse'],
];
const TOOL_NAME = Object.fromEntries(TOOLS);
const SHORTCUT = { v: 'select', c: 'cloud', k: 'cloudplus', q: 'callout', t: 'text', a: 'arrow', p: 'pen', h: 'hl', r: 'rect', e: 'ellipse' };

export const COLORS = [
  ['#e11d2a', 'Red'], ['#ea580c', 'Orange'], ['#facc15', 'Yellow'], ['#16a34a', 'Green'], ['#0891b2', 'Teal'], ['#1d4ed8', 'Blue'],
  ['#7c3aed', 'Purple'], ['#db2777', 'Pink'], ['#92400e', 'Brown'], ['#111111', 'Black'], ['#6b7280', 'Grey'], ['#ffffff', 'White'],
];
const WIDTHS = [1, 2, 3, 4, 6, 10];
const HL_WIDTHS = [8, 14, 20, 30];
const SIZES = ['auto', 8, 10, 12, 14, 18, 24, 36, 48, 72];
const OPACITIES = [1, 0.75, 0.5, 0.25];
const HEADS = [['closed', 'Filled'], ['open', 'Open'], ['dot', 'Dot'], ['none', 'None']];

const PROPS = {
  cloud: ['color', 'fill', 'fillOpacity', 'width', 'opacity'],
  cloudplus: ['color', 'fill', 'fillOpacity', 'textColor', 'fontSize', 'width', 'head', 'opacity'],
  callout: ['color', 'fill', 'textColor', 'fontSize', 'width', 'head', 'border', 'opacity'],
  text: ['textColor', 'fontSize', 'fill', 'border'],
  arrow: ['color', 'width', 'head', 'opacity'],
  pen: ['color', 'width', 'opacity'],
  hl: ['color', 'width'],
  rect: ['color', 'fill', 'fillOpacity', 'width', 'opacity'],
  ellipse: ['color', 'fill', 'fillOpacity', 'width', 'opacity'],
};
const LABEL = { color: 'Line', fill: 'Fill', fillOpacity: 'Fill', textColor: 'Text', width: 'Width', fontSize: 'Size', head: 'Arrow', border: 'Border', opacity: 'Opacity' };

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) e.append(kid);
  return e;
}

const headIcon = style => {
  const tip = { closed: '<path d="M21 12l-7-4v8z" fill="currentColor"/>', open: '<path d="M14 7.500l7 4.500-7 4.500"/>', dot: '<circle cx="18.500" cy="12" r="2.800" fill="currentColor"/>', none: '' }[style] || '';
  return `<svg class="ic" width="28" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h${style === 'closed' ? 12 : 17}"/>${tip}</svg>`;
};

function ago(ts) {
  const days = Math.floor((Date.now() - ts) / 864e5);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function initUI(app) {
  const $ = id => document.getElementById(id);
  const rail = $('rail'), props = $('props'), pop = $('pop'), sheet = $('sheet'), home = $('home');
  for (const s of document.querySelectorAll('[data-icon]')) s.outerHTML = icon(s.dataset.icon);

  // ---- tool rail ----------------------------------------------------------
  TOOLS.forEach(([id, label], i) => {
    if (i === 1 || i === 5) rail.append(h('div', { class: 'rail-gap' }));
    rail.append(h('button', { class: 'tool', 'data-tool': id, 'aria-label': label, html: `${icon(id)}<span>${label}</span>`, onclick: () => app.setTool(id) }));
  });
  const lockBtn = h('button', {
    class: 'tool lock', 'aria-label': 'Keep the tool on',
    onclick: () => { app.lock = !app.lock; refresh(); toast(app.lock ? 'Tool stays on until you change it' : 'Back to Select after each markup'); },
  });
  rail.append(lockBtn);

  // ---- messages -----------------------------------------------------------
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function hint(msg) { const e = $('hint'); e.hidden = !msg; e.textContent = msg || ''; }
  function busy(msg) { $('busy').hidden = !msg; $('busy-text').textContent = msg || ''; }

  // ---- popover ------------------------------------------------------------
  function closePop() { pop.hidden = true; pop.textContent = ''; }
  function openPop(anchor, content) {
    pop.textContent = '';
    pop.append(content);
    pop.hidden = false;
    const a = anchor.getBoundingClientRect(), w = pop.offsetWidth, ph = pop.offsetHeight;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, a.left + a.width / 2 - w / 2));
    let top = a.top - ph - 10;
    if (top < 8) top = a.bottom + 10;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
  document.addEventListener('pointerdown', e => {
    if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('.prop')) closePop();
  }, true);

  // ---- options bar --------------------------------------------------------
  const swatch = c => h('span', { class: c ? 'sw' : 'sw none', style: c ? `--c:${c}` : null });
  const widthLine = w => h('span', { class: 'wline', style: `height:${Math.max(2, Math.min(12, w * 1.4))}px` });

  function choices(key, type, val) {
    const pick = v => { closePop(); app.setProp(key, v); };
    if (key === 'color' || key === 'textColor' || key === 'fill') {
      const grid = h('div', { class: 'pop-grid' });
      if (key === 'fill') grid.append(h('button', { class: 'chip swatch', 'aria-label': 'No fill', 'aria-pressed': String(val == null), onclick: () => pick(null) }, swatch(null)));
      for (const [c, name] of COLORS) grid.append(h('button', { class: 'chip swatch', 'aria-label': name, title: name, 'aria-pressed': String(val === c), onclick: () => pick(c) }, swatch(c)));
      return grid;
    }
    const row = h('div', { class: 'pop-row' });
    if (key === 'width') {
      for (const w of type === 'hl' ? HL_WIDTHS : WIDTHS) row.append(h('button', { class: 'chip col', 'aria-pressed': String(val === w), onclick: () => pick(w) }, widthLine(type === 'hl' ? w / 3 : w), String(w)));
    } else if (key === 'fontSize') {
      for (const s of SIZES) row.append(h('button', { class: 'chip', 'aria-pressed': String(val === s), onclick: () => pick(s) }, s === 'auto' ? 'Auto' : String(s)));
    } else if (key === 'head') {
      for (const [id, name] of HEADS) row.append(h('button', { class: 'chip col', 'aria-pressed': String(val === id), html: `${headIcon(id)}<span>${name}</span>`, onclick: () => pick(id) }));
    } else if (key === 'opacity' || key === 'fillOpacity') {
      for (const o of OPACITIES) row.append(h('button', { class: 'chip', 'aria-pressed': String(val === o), onclick: () => pick(o) }, `${o * 100}%`));
    }
    return row;
  }

  function propButton(type, key) {
    const val = app.propValue(key);
    let label = LABEL[key];
    if (key === 'color' && (type === 'pen' || type === 'hl' || type === 'arrow')) label = 'Colour';
    const lbl = h('span', { class: 'lbl' }, label);
    const b = h('button', { class: 'prop', 'data-key': key, 'aria-label': label });
    if (key === 'color' || key === 'textColor' || key === 'fill') b.append(swatch(val), lbl);
    else if (key === 'width') b.append(widthLine(type === 'hl' ? val / 3 : val), lbl);
    else if (key === 'fontSize') b.append(lbl, val === 'auto' ? 'Auto' : `${val} pt`);
    else if (key === 'head') { b.innerHTML = headIcon(val); b.append(lbl); }
    else if (key === 'opacity' || key === 'fillOpacity') b.append(lbl, `${Math.round(val * 100)}%`);
    else if (key === 'border') { b.append(lbl); b.setAttribute('aria-pressed', String(!!val)); }
    b.addEventListener('click', () => {
      if (key === 'border') return app.setProp('border', !val);
      if (!pop.hidden && pop.dataset.key === key) return closePop();
      pop.dataset.key = key;
      openPop(b, choices(key, type, val));
    });
    return b;
  }

  function renderProps() {
    closePop();
    props.textContent = '';
    if (!app.doc) return;
    const m = app.selected(), type = m ? m.type : app.tool;
    if (type === 'select') {
      props.append(h('div', { class: 'tip' }, 'Tap a markup to change it. Drag empty space to move the page. Pinch to zoom.'));
      return;
    }
    props.append(h('div', { class: 'prop-title' }, TOOL_NAME[type] || ''));
    for (const key of PROPS[type]) {
      if (key === 'fillOpacity' && !app.propValue('fill')) continue;      // only once a fill colour is chosen
      props.append(propButton(type, key));
    }
    if (m) {
      // Kept in view at the right-hand end even when the options scroll.
      props.append(h('div', { class: 'spacer' }), h('div', { class: 'actions' },
        TEXT_TYPES.has(m.type) && m.box ? h('button', { class: 'prop act', 'aria-label': 'Edit text', html: `${icon('edit', 22)}<span>Edit</span>`, onclick: () => app.startEdit(m) }) : null,
        h('button', { class: 'prop act', 'aria-label': 'Duplicate', html: `${icon('copy', 22)}<span>Copy</span>`, onclick: () => app.duplicateSelected() }),
        h('button', { class: 'prop act danger', 'aria-label': 'Delete', html: `${icon('trash', 22)}<span>Delete</span>`, onclick: () => app.deleteSelected() })));
    }
  }

  function refresh() {
    const d = app.doc;
    document.body.dataset.doc = d ? '1' : '0';
    $('doc-name').textContent = d ? d.name : '';
    $('page-label').textContent = d ? `${d.pageIndex + 1} / ${d.pageCount}` : '';
    $('btn-prev').disabled = !d || d.pageIndex === 0;
    $('btn-next').disabled = !d || d.pageIndex >= d.pageCount - 1;
    $('btn-undo').disabled = !app.undoStack.length;
    $('btn-redo').disabled = !app.redoStack.length;
    for (const b of rail.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', String(b.dataset.tool === app.tool));
    lockBtn.setAttribute('aria-pressed', String(app.lock));
    lockBtn.innerHTML = `${icon(app.lock ? 'lock' : 'unlock')}<span>${app.lock ? 'Locked' : 'Lock'}</span>`;
    renderProps();
  }

  // ---- sheets -------------------------------------------------------------
  function closeSheet() { sheet.hidden = true; sheet.textContent = ''; }
  function openSheet(title, body, { wide = false } = {}) {
    closePop();
    sheet.textContent = '';
    sheet.append(h('div', { class: wide ? 'sheet-card wide' : 'sheet-card', role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'tb icon', 'aria-label': 'Close', html: icon('close'), onclick: closeSheet })),
      h('div', { class: 'sheet-body' }, body)));
    sheet.hidden = false;
  }
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

  function alert(title, message) {
    openSheet(title, [h('p', {}, message), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'OK'))]);
  }

  // ---- files (home) -------------------------------------------------------
  async function showHome(show) {
    home.hidden = !show;
    if (!show) return;
    closePop();
    let docs = [];
    try { docs = await store.listDocs(); } catch { /* storage unavailable */ }
    const list = h('div', { class: 'doc-list' });
    for (const d of docs) {
      const n = (d.markups || []).length;
      list.append(h('div', { class: 'doc' },
        h('button', { class: 'doc-open', onclick: () => app.openStored(d.id) },
          h('span', { class: 'doc-name' }, d.name),
          h('span', { class: 'doc-meta' }, `${d.pageCount || '?'} ${d.pageCount === 1 ? 'page' : 'pages'} · ${n} ${n === 1 ? 'markup' : 'markups'} · ${ago(d.updated)}`)),
        h('button', {
          class: 'doc-del', 'aria-label': `Remove ${d.name}`, html: icon('trash', 22),
          onclick: async () => {
            if (!window.confirm(`Remove "${d.name}" and its markups from this device?`)) return;
            await app.removeStored(d.id);
            showHome(true);
          },
        })));
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    home.textContent = '';
    home.append(h('div', { class: 'home-inner home' },
      h('div', { class: 'home-head' },
        h('img', { src: 'icons/icon-192.png', alt: '' }),
        h('h1', {}, 'Redline'),
        app.doc ? h('button', { class: 'tb icon', 'aria-label': 'Back to drawing', html: icon('close'), onclick: () => showHome(false) }) : null),
      h('button', { class: 'big', html: `${icon('plus')}<span>Open a PDF</span>`, onclick: () => $('file').click() }),
      h('h2', {}, 'On this device'),
      docs.length ? list : h('div', { class: 'empty' }, 'Nothing here yet. PDFs you open are kept on this device with their markups, so they are ready when there is no signal.'),
      ios && !standalone ? h('div', { class: 'note', html: '<b>Install it:</b> tap the Share button in Safari, then <b>Add to Home Screen</b>. Redline then opens full screen and works offline.' }) : null));
  }

  // ---- pages --------------------------------------------------------------
  function pagesSheet() {
    const d = app.doc;
    if (!d) return;
    const grid = h('div', { class: 'page-grid' });
    const counts = {};
    for (const m of app.markups) counts[m.page] = (counts[m.page] || 0) + 1;
    const queue = [];
    let running = false;
    const pump = async () => {
      if (running) return;
      running = true;
      while (queue.length && !sheet.hidden) {
        const { i, canvas } = queue.shift();
        try {
          const page = await d.pdf.getPage(i + 1);
          const vp1 = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: Math.min(260 / vp1.width, 200 / vp1.height) });
          canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
          await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        } catch { /* skip this thumbnail */ }
      }
      running = false;
    };
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        io.unobserve(en.target);
        queue.push({ i: Number(en.target.dataset.page), canvas: en.target.querySelector('canvas') });
      }
      pump();
    }, { root: null, rootMargin: '200px' });
    for (let i = 0; i < d.pageCount; i++) {
      const tile = h('button', { class: 'page-tile', 'data-page': i, 'aria-current': String(i === d.pageIndex), onclick: () => { closeSheet(); app.goPage(i); } },
        h('canvas', { width: 4, height: 3 }),
        h('span', {}, `Page ${i + 1}`, counts[i] ? h('span', { class: 'badge' }, `  · ${counts[i]}`) : null));
      grid.append(tile);
      io.observe(tile);
    }
    openSheet('Pages', grid, { wide: true });
    const cur = grid.querySelector('[aria-current="true"]');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  // ---- export -------------------------------------------------------------
  function exportSheet() {
    if (!app.doc) return;
    if (app.editing) app.commitEdit();
    if (!app.doc.writable) return alert('This PDF cannot be saved to', 'Redline can show this file but cannot write markups into it. Try re-saving it from Revu or printing it to a new PDF first.');
    const n = app.markups.length;
    const run = async flatten => {
      busy('Building PDF…');
      try {
        const bytes = await app.buildPdf({ flatten });
        const name = app.exportName();
        const file = new File([bytes], name, { type: 'application/pdf' });
        const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
        const share = async () => {
          try { await navigator.share({ files: [file], title: name }); closeSheet(); }
          catch (e) { if (e && e.name !== 'AbortError') toast('Sharing did not work. Try Download.'); }
        };
        const download = () => {
          const url = URL.createObjectURL(file);
          const a = h('a', { href: url, download: name });
          document.body.append(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
        };
        openSheet('Ready', [
          h('div', { class: 'file-out' }, `${name} · ${(bytes.length / 1048576).toFixed(bytes.length > 1048576 ? 1 : 2)} MB`),
          h('p', { class: 'muted' }, flatten ? 'Markups are part of the page and cannot be moved.' : 'Markups stay editable in Revu and other PDF apps.'),
          h('div', { class: 'row' },
            canShare ? h('button', { class: 'btn primary', html: `${icon('share', 22)}<span>Share or save</span>`, onclick: share }) : null,
            h('button', { class: canShare ? 'btn' : 'btn primary', html: `${icon('download', 22)}<span>Download</span>`, onclick: download })),
        ]);
      } catch (e) {
        console.error(e);
        alert('Export did not work', String((e && e.message) || e));
      } finally { busy(null); }
    };
    openSheet('Export', [
      h('p', { class: 'muted' }, `${n} ${n === 1 ? 'markup' : 'markups'} on ${new Set(app.markups.map(m => m.page)).size || 0} of ${app.doc.pageCount} ${app.doc.pageCount === 1 ? 'page' : 'pages'}.`),
      h('button', { class: 'choice', onclick: () => run(false) }, h('b', {}, 'Editable markups'), h('span', {}, 'Best for sending to the office. Revu can move, restyle and reply to each markup.')),
      h('button', { class: 'choice', onclick: () => run(true) }, h('b', {}, 'Flattened'), h('span', {}, 'Markups are burnt into the page. Nobody can move or remove them.')),
    ]);
  }

  // ---- settings -----------------------------------------------------------
  async function settingsSheet() {
    const name = h('input', { type: 'text', id: 'set-author', value: app.prefs.author || '', placeholder: 'e.g. A. Smith', autocomplete: 'name' });
    name.addEventListener('change', () => { app.prefs.author = name.value.trim(); store.savePrefs(app.prefs); });
    const finger = h('input', { type: 'checkbox', id: 'set-finger', checked: app.prefs.fingerDraws });
    finger.addEventListener('change', () => { app.prefs.fingerDraws = finger.checked; store.savePrefs(app.prefs); });
    let usage = '';
    try {
      const est = await navigator.storage.estimate();
      usage = `${(est.usage / 1048576).toFixed(1)} MB used on this device.`;
    } catch { /* not available */ }
    openSheet('Settings', [
      h('div', { class: 'field' }, h('label', { for: 'set-author' }, 'Your name on markups'), name, h('small', {}, 'Shown as the author in Revu.')),
      h('label', { class: 'switch', for: 'set-finger' }, finger, h('span', {}, 'Draw with a finger even after using Apple Pencil')),
      h('p', { class: 'muted' }, 'Keyboard: V select, C cloud, K cloud+, Q callout, T text, A arrow, P pen, H highlight, R box, E ellipse.'),
      h('p', { class: 'muted' }, `Redline ${app.version}. ${usage} PDFs and markups stay on this device.`),
    ]);
  }

  // ---- wiring -------------------------------------------------------------
  $('btn-files').addEventListener('click', () => { if (app.editing) app.commitEdit(); showHome(true); });
  $('btn-prev').addEventListener('click', () => app.goPage(app.doc.pageIndex - 1));
  $('btn-next').addEventListener('click', () => app.goPage(app.doc.pageIndex + 1));
  $('btn-pages').addEventListener('click', pagesSheet);
  $('btn-undo').addEventListener('click', () => app.undo());
  $('btn-redo').addEventListener('click', () => app.redo());
  $('btn-more').addEventListener('click', settingsSheet);
  $('btn-export').addEventListener('click', exportSheet);
  $('btn-fit').addEventListener('click', () => app.viewer.fit());

  document.addEventListener('keydown', e => {
    if (!app.doc || e.target.closest('input, textarea') || !sheet.hidden || !home.hidden) return;
    const mod = e.metaKey || e.ctrlKey, key = e.key.toLowerCase();
    if (mod && key === 'z') { e.preventDefault(); e.shiftKey ? app.redo() : app.undo(); }
    else if (mod && key === 'y') { e.preventDefault(); app.redo(); }
    else if (mod && key === 'd') { e.preventDefault(); app.duplicateSelected(); }
    else if (mod) return;
    else if (key === 'delete' || key === 'backspace') { e.preventDefault(); app.deleteSelected(); }
    else if (key === 'escape') { app.tools.cancelPending(); app.select(null); app.setTool('select'); }
    else if (key === 'enter' && app.selected() && TEXT_TYPES.has(app.selected().type) && app.selected().box) { e.preventDefault(); app.startEdit(app.selected()); }
    else if (SHORTCUT[key]) app.setTool(SHORTCUT[key]);
    else if (key === 'pagedown' && app.doc.pageIndex < app.doc.pageCount - 1) app.goPage(app.doc.pageIndex + 1);
    else if (key === 'pageup' && app.doc.pageIndex > 0) app.goPage(app.doc.pageIndex - 1);
  });

  app.ui = { refresh, toast, hint, busy, alert, showHome, closeSheet, closePop };
}
