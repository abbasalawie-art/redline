// Everything around the drawing: tool rail, options bar, files, pages, export, settings.
import { icon } from './icons.js';
import { TEXT_TYPES, MEASURE_TYPES, measureOf } from './shapes.js';
import * as store from './store.js';

// The rail. An entry with several tools remembers which one was used last.
const RAIL = [
  { id: 'select', label: 'Select', tools: ['select'] },
  null,
  { id: 'cloud', label: 'Cloud', tools: ['cloud'] },
  { id: 'cloudplus', label: 'Cloud+', tools: ['cloudplus'] },
  { id: 'callout', label: 'Callout', tools: ['callout'] },
  { id: 'text', label: 'Text', tools: ['text', 'retype'] },
  null,
  { id: 'arrow', label: 'Arrow', tools: ['arrow'] },
  { id: 'pen', label: 'Pen', tools: ['pen'] },
  { id: 'hl', label: 'Highlight', tools: ['hl'] },
  { id: 'rect', label: 'Shape', tools: ['rect', 'ellipse'] },
  null,
  { id: 'kit', label: 'Symbols', tools: ['stamp', 'sig', 'snip'], open: app => app.kit.open() },
  { id: 'pin', label: 'Pin', tools: ['pin'] },
  { id: 'dim', label: 'Measure', tools: ['dim', 'path', 'area'] },
];
const MODES = {
  text: [['text', 'New text'], ['retype', 'Retype']], retype: [['text', 'New text'], ['retype', 'Retype']],
  rect: [['rect', 'Box'], ['ellipse', 'Ellipse']], ellipse: [['rect', 'Box'], ['ellipse', 'Ellipse']],
  dim: [['dim', 'Length'], ['path', 'Run'], ['area', 'Area']], path: [['dim', 'Length'], ['path', 'Run'], ['area', 'Area']], area: [['dim', 'Length'], ['path', 'Run'], ['area', 'Area']],
};
export const TOOL_NAME = {
  select: 'Select', cloud: 'Cloud', cloudplus: 'Cloud+', callout: 'Callout', text: 'Text', retype: 'Retype', arrow: 'Arrow', pen: 'Pen',
  hl: 'Highlight', rect: 'Box', ellipse: 'Ellipse', stamp: 'Symbol', pin: 'Pin', dim: 'Length', path: 'Run', area: 'Area', sig: 'Signature', snip: 'New sticker',
};
const CAN_FAVOURITE = new Set(['cloud', 'cloudplus', 'callout', 'text', 'arrow', 'pen', 'hl', 'rect', 'ellipse', 'dim', 'path', 'area']);

export const COLORS = [
  ['#e11d2a', 'Red'], ['#ea580c', 'Orange'], ['#facc15', 'Yellow'], ['#16a34a', 'Green'], ['#0891b2', 'Teal'], ['#1d4ed8', 'Blue'],
  ['#7c3aed', 'Purple'], ['#db2777', 'Pink'], ['#92400e', 'Brown'], ['#111111', 'Black'], ['#6b7280', 'Grey'], ['#ffffff', 'White'],
];
const WIDTHS = [1, 1.5, 2, 3, 4, 6, 10];
const HL_WIDTHS = [8, 14, 20, 30];
const SIZES = ['auto', 8, 10, 12, 14, 18, 24, 36, 48, 72];
const OPACITIES = [1, 0.75, 0.5, 0.25];
const FILL_OPACITIES = [1, 0.75, 0.5, 0.25, 0.15];
const HEADS = [['closed', 'Filled'], ['open', 'Open'], ['dot', 'Dot'], ['none', 'None']];
const SCALES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
const TURNS = [0, 45, 90, 135, 180, 225, 270, 315];
const PIN_SIZES = [[0.75, 'Small'], [1, 'Medium'], [1.5, 'Large'], [2, 'Huge']];
const CLOUD_SHAPES = [['box', 'Box'], ['poly', 'Corners'], ['free', 'Freehand']];
const RATIOS = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
export const MPP_PER_RATIO = 0.0254 / 72;       // metres per page point at 1:1

const PROPS = {
  cloud: ['shape', 'color', 'fill', 'fillOpacity', 'width', 'opacity'],
  cloudplus: ['color', 'fill', 'fillOpacity', 'textColor', 'fontSize', 'width', 'head', 'opacity'],
  callout: ['color', 'fill', 'textColor', 'fontSize', 'width', 'head', 'border', 'opacity'],
  text: ['textColor', 'fontSize', 'fill', 'border'],
  arrow: ['color', 'width', 'head', 'opacity'],
  pen: ['color', 'width', 'opacity'],
  hl: ['color', 'width'],
  rect: ['color', 'fill', 'fillOpacity', 'width', 'opacity'],
  ellipse: ['color', 'fill', 'fillOpacity', 'width', 'opacity'],
  stamp: ['mode', 'markColor', 'scale', 'rot', 'opacity'],
  pin: ['color', 'size'],
  dim: ['color', 'width', 'fontSize'],
  path: ['color', 'width', 'fontSize'],
  area: ['color', 'fill', 'fillOpacity', 'width', 'fontSize'],
  sig: ['color', 'width'],
  retype: [], snip: [],
};
const LABEL = {
  color: 'Line', fill: 'Fill', fillOpacity: 'Fill', textColor: 'Text', width: 'Width', fontSize: 'Size', head: 'Arrow', border: 'Border',
  opacity: 'Opacity', markColor: 'Colour', scale: 'Size', rot: 'Turn', size: 'Size', shape: 'Shape',
};
const TIPS = {
  retype: 'Tap a line of text to retype it. Or drag a box over anything to cover it and type on top.',
  snip: 'Drag a box around what you want to keep as a sticker.',
  pin: 'Tap where the photo or note belongs.',
};

export function h(tag, attrs = {}, ...kids) {
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

/** "1:100", or the plain figure when the scale is not a round ratio. */
export function scaleLabel(mpp) {
  if (!mpp) return 'not set';
  const n = mpp / MPP_PER_RATIO;
  return Math.abs(n - Math.round(n)) < 0.02 * Math.max(1, n / 50) ? `1:${Math.round(n)}` : `1:${n.toFixed(1)}`;
}

export function initUI(app) {
  const $ = id => document.getElementById(id);
  const rail = $('rail'), props = $('props'), pop = $('pop'), sheet = $('sheet'), home = $('home');
  for (const s of document.querySelectorAll('[data-icon]')) s.outerHTML = icon(s.dataset.icon);

  // ---- tool rail ----------------------------------------------------------
  const last = {};        // rail entry → the tool it used last
  for (const entry of RAIL) {
    if (!entry) { rail.append(h('div', { class: 'rail-gap' })); continue; }
    rail.append(h('button', {
      class: 'tool', 'data-rail': entry.id, 'aria-label': entry.label, html: `${icon(entry.id)}<span>${entry.label}</span>`,
      onclick: () => {
        // Tapping the tool already in hand puts it down again.
        if (entry.id !== 'select' && entry.tools.includes(app.tool)) return app.setTool('select');
        return entry.open ? entry.open(app) : app.setTool(last[entry.id] || entry.tools[0]);
      },
    }));
  }
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
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  function hint(msg) { const e = $('hint'); e.hidden = !msg; e.textContent = msg || ''; }
  function busy(msg) { $('busy').hidden = !msg; $('busy-text').textContent = msg || ''; }

  // Shown while a shape is being tapped out corner by corner.
  const polybar = h('div', { id: 'polybar', class: 'stage-ui', hidden: true },
    h('button', { class: 'btn', onclick: () => app.tools.polyUndo() }, 'Undo point'),
    h('button', { class: 'btn primary', onclick: () => app.tools.polyDone() }, 'Done'));
  app.el.stage.append(polybar);
  function polyBar(show) { polybar.hidden = !show; }

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
  const pct = v => `${Math.round(v * 100)}%`;

  function choices(key, type, val) {
    const pick = v => { closePop(); app.setProp(key, v); };
    if (key === 'color' || key === 'textColor' || key === 'fill' || key === 'markColor') {
      const grid = h('div', { class: 'pop-grid' });
      if (key === 'fill') grid.append(h('button', { class: 'chip swatch', 'aria-label': 'No fill', 'aria-pressed': String(val == null), onclick: () => pick(null) }, swatch(null)));
      for (const [c, name] of COLORS) grid.append(h('button', { class: 'chip swatch', 'aria-label': name, title: name, 'aria-pressed': String(val === c), onclick: () => pick(c) }, swatch(c)));
      return grid;
    }
    const row = h('div', { class: 'pop-row' });
    const chips = (list, label) => { for (const v of list) row.append(h('button', { class: 'chip', 'aria-pressed': String(val === v), onclick: () => pick(v) }, label(v))); };
    if (key === 'width') {
      for (const w of type === 'hl' ? HL_WIDTHS : WIDTHS) row.append(h('button', { class: 'chip col', 'aria-pressed': String(val === w), onclick: () => pick(w) }, widthLine(type === 'hl' ? w / 3 : w), String(w)));
    } else if (key === 'fontSize') chips(SIZES, s => (s === 'auto' ? 'Auto' : String(s)));
    else if (key === 'head') {
      for (const [id, name] of HEADS) row.append(h('button', { class: 'chip col', 'aria-pressed': String(val === id), html: `${headIcon(id)}<span>${name}</span>`, onclick: () => pick(id) }));
    } else if (key === 'opacity') chips(OPACITIES, pct);
    else if (key === 'fillOpacity') chips(FILL_OPACITIES, pct);
    else if (key === 'scale') chips(SCALES, pct);
    else if (key === 'rot') chips(TURNS, v => `${v}°`);
    else if (key === 'size') for (const [v, name] of PIN_SIZES) row.append(h('button', { class: 'chip', 'aria-pressed': String(val === v), onclick: () => pick(v) }, name));
    else if (key === 'shape') for (const [v, name] of CLOUD_SHAPES) row.append(h('button', { class: 'chip', 'aria-pressed': String((val || 'box') === v), onclick: () => pick(v) }, name));
    return row;
  }

  function propButton(type, key) {
    const val = app.propValue(key);
    let label = LABEL[key];
    if (key === 'color' && (type === 'pen' || type === 'hl' || type === 'arrow' || type === 'pin' || type === 'sig' || MEASURE_TYPES.has(type))) label = 'Colour';
    const lbl = h('span', { class: 'lbl' }, label);
    const b = h('button', { class: 'prop', 'data-key': key, 'aria-label': label });
    if (key === 'color' || key === 'textColor' || key === 'fill' || key === 'markColor') b.append(swatch(val), lbl);
    else if (key === 'width') b.append(widthLine(type === 'hl' ? val / 3 : val), lbl);
    else if (key === 'fontSize') b.append(lbl, val === 'auto' ? 'Auto' : `${Math.round(val * 10) / 10} pt`);
    else if (key === 'head') { b.innerHTML = headIcon(val); b.append(lbl); }
    else if (key === 'opacity' || key === 'fillOpacity' || key === 'scale') b.append(lbl, pct(val));
    else if (key === 'rot') b.append(lbl, `${val}°`);
    else if (key === 'size') b.append(lbl, (PIN_SIZES.find(s => s[0] === val) || [0, pct(val)])[1]);
    else if (key === 'shape') b.append(lbl, (CLOUD_SHAPES.find(s => s[0] === (val || 'box')) || CLOUD_SHAPES[0])[1]);
    else if (key === 'border') { b.append(lbl); b.setAttribute('aria-pressed', String(!!val)); }
    b.addEventListener('click', () => {
      if (key === 'border') return app.setProp('border', !val);
      if (!pop.hidden && pop.dataset.key === key) return closePop();
      pop.dataset.key = key;
      openPop(b, choices(key, type, val));
    });
    return b;
  }

  const act = (name, label, onclick, cls = '') => h('button', { class: `prop act ${cls}`, 'aria-label': label, html: `${icon(name, 22)}<span>${label}</span>`, onclick });

  function renderProps() {
    closePop();
    props.textContent = '';
    if (!app.doc) return;
    const m = app.selected(), type = m ? m.type : app.tool;
    if (type === 'select') {
      props.append(h('div', { class: 'tip' }, 'Tap a markup to change it. Drag empty space to move the page. Pinch to zoom.'));
      return;
    }
    if (!m && MODES[type]) {
      // Sister tools behind one rail button.
      props.append(h('div', { class: 'seg' }, MODES[type].map(([id, name]) => h('button', { 'aria-pressed': String(id === type), onclick: () => app.setTool(id) }, name))));
    } else {
      props.append(h('div', { class: 'prop-title' }, m && m.type === 'stamp' ? (m.name || 'Symbol') : m && m.type === 'pin' ? `Pin ${m.n}` : TOOL_NAME[type] || ''));
    }
    if (!m && type === 'stamp') props.append(app.kit.currentButton());
    if (!m && type === 'sig') props.append(h('button', { class: 'prop', onclick: () => app.kit.signaturePad() }, 'New signature'));
    if (!m && MEASURE_TYPES.has(type)) props.append(h('button', { class: 'prop', onclick: scaleSheet, html: `${icon('scale', 22)}<span class="lbl">Scale</span>${scaleLabel(app.scaleOf(app.doc.pageIndex))}` }));
    if (m && MEASURE_TYPES.has(type)) {
      const q = measureOf(m);
      props.append(h('div', { class: 'tip strong' }, type === 'area' ? `${q.label} · ${Math.round(q.length * 100) / 100} m round` : q.label));
    }
    if (!m && TIPS[type]) props.append(h('div', { class: 'tip' }, TIPS[type]));
    for (const key of PROPS[type] || []) {
      if (key === 'fillOpacity' && !app.propValue('fill') && type !== 'area') continue;      // only once a fill colour is chosen
      if (key === 'shape' && m) continue;
      if (key === 'mode' || key === 'markColor') {
        // Markup: the symbol in your markup colour. Design: as it is on the legend.
        if (!(m ? app.kit.canTint(m) : app.kit.currentCanTint())) continue;
        if (key === 'mode') { props.append(app.kit.modeSwitch(app.propValue('mode'), v => app.setProp('mode', v))); continue; }
        if (app.propValue('mode') !== 'markup') continue;
      }
      props.append(propButton(type, key));
    }
    // Kept in view at the right-hand end even when the options scroll.
    const actions = [];
    if (m) {
      if (TEXT_TYPES.has(m.type) && m.box) actions.push(act('edit', 'Edit', () => app.startEdit(m)));
      if (m.type === 'pin') actions.push(act('camera', 'Note', () => app.pins.open(m)));
      if (m.type === 'dim') actions.push(act('scale', 'Calibrate', () => calibrateSheet(m)));
      actions.push(act('copy', 'Copy', () => app.duplicateSelected()), act('trash', 'Delete', () => app.deleteSelected(), 'danger'));
    } else if (CAN_FAVOURITE.has(type)) {
      actions.push(act('star', 'Save', () => app.kit.addFavourite(type)));
    }
    if (actions.length) props.append(h('div', { class: 'spacer' }), h('div', { class: 'actions' }, actions));
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
    for (const entry of RAIL) {
      if (!entry) continue;
      const on = entry.tools.includes(app.tool);
      if (on) last[entry.id] = app.tool;
      rail.querySelector(`[data-rail="${entry.id}"]`).setAttribute('aria-pressed', String(on));
    }
    lockBtn.setAttribute('aria-pressed', String(app.lock));
    lockBtn.innerHTML = `${icon(app.lock ? 'lock' : 'unlock')}<span>${app.lock ? 'Locked' : 'Lock'}</span>`;
    // Save shows only where the browser can write files (a PC). A dot marks changes that are not in the file yet.
    const saveBtn = $('btn-save'), canSave = !!(app.files && app.files.canPick);
    saveBtn.hidden = !canSave;
    saveBtn.disabled = !d;
    saveBtn.classList.toggle('unsaved', !!(d && d.dirty));
    saveBtn.title = d && d.handle ? `Save to ${d.name} (Ctrl+S)` : 'Save (Ctrl+S)';
    renderProps();
  }

  // ---- sheets -------------------------------------------------------------
  let whenClosed = null;      // runs once when the open sheet goes away, however it goes
  function closeSheet() {
    const f = whenClosed;
    whenClosed = null;
    sheet.hidden = true; sheet.textContent = '';
    if (f) f();
  }
  function openSheet(title, body, { wide = false, onClose = null } = {}) {
    closePop();
    closeSheet();
    sheet.append(h('div', { class: wide ? 'sheet-card wide' : 'sheet-card', role: 'dialog', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h2', {}, title), h('button', { class: 'tb icon', 'aria-label': 'Close', html: icon('close'), onclick: closeSheet })),
      h('div', { class: 'sheet-body' }, body)));
    whenClosed = onClose;
    sheet.hidden = false;
  }
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

  function alert(title, message) {
    openSheet(title, [h('p', {}, message), h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: closeSheet }, 'OK'))]);
  }

  /** Ask a question with a button per answer. Gives the number of the answer, or -1 if the sheet was just closed. */
  function choose(title, message, answers) {
    return new Promise(resolve => {
      let done = false;
      const finish = i => { if (!done) { done = true; resolve(i); } };
      openSheet(title, [h('p', {}, message), h('div', { class: 'row' },
        answers.map((a, i) => h('button', { class: i === 0 ? 'btn primary' : 'btn', onclick: () => { finish(i); closeSheet(); } }, a)))], { onClose: () => finish(-1) });
    });
  }

  /** Hand a finished file to the user: the iOS share sheet where there is one, a download otherwise. */
  function deliver(bytes, name, mime, note, onDone = null) {
    const file = new File([bytes], name, { type: mime });
    const size = file.size;
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [file] }));
    const share = async () => {
      try { await navigator.share({ files: [file], title: name }); if (onDone) onDone(); closeSheet(); }
      catch (e) { if (e && e.name !== 'AbortError') toast('Sharing did not work. Try Download.'); }
    };
    const download = () => {
      const url = URL.createObjectURL(file);
      const a = h('a', { href: url, download: name });
      document.body.append(a); a.click(); a.remove();
      if (onDone) onDone();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    };
    openSheet('Ready', [
      h('div', { class: 'file-out' }, `${name} · ${size > 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`}`),
      note ? h('p', { class: 'muted' }, note) : null,
      h('div', { class: 'row' },
        canShare ? h('button', { class: 'btn primary', html: `${icon('share', 22)}<span>Share or save</span>`, onclick: share }) : null,
        h('button', { class: canShare ? 'btn' : 'btn primary', html: `${icon('download', 22)}<span>Download</span>`, onclick: download })),
    ]);
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
      h('button', { class: 'big', html: `${icon('plus')}<span>Open a PDF</span>`, onclick: () => app.files.openPicker() }),
      h('h2', {}, 'On this device'),
      docs.length ? list : h('div', { class: 'empty' }, 'Nothing here yet. PDFs you open are kept on this device with their markups, so they are ready when there is no signal.'),
      ios && !standalone ? h('div', { class: 'note', html: '<b>Install it:</b> tap the Share button in Safari, then <b>Add to Home Screen</b>. Redline then opens full screen and works offline.' }) : null));
  }

  // ---- pages --------------------------------------------------------------
  function pagesSheet() {
    const d = app.doc;
    if (!d) return;
    if (app.editing) app.commitEdit();
    const grid = h('div', { class: 'page-grid' });
    const counts = {};
    for (const m of app.markups) counts[m.page] = (counts[m.page] || 0) + 1;
    const queue = [];
    let running = false;
    const pump = async () => {
      if (running) return;
      running = true;
      while (queue.length && !sheet.hidden && app.doc === d) {
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
    openSheet('Pages', [app.pagesTool.toolbar(pagesSheet), grid], { wide: true });
    const cur = grid.querySelector('[aria-current="true"]');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  // ---- export -------------------------------------------------------------
  function exportSheet() {
    if (!app.doc) return;
    if (app.editing) app.commitEdit();
    app.tools.cancelPending();
    if (!app.doc.writable) return alert('This PDF cannot be saved to', 'Redline can show this file but cannot write markups into it. Try re-saving it from Revu or printing it to a new PDF first.');
    const n = app.markups.length, photos = app.markups.filter(m => m.type === 'pin' && m.photo).length;
    const withPhotos = h('input', { type: 'checkbox', id: 'exp-photos', checked: true });
    const run = async flatten => {
      busy('Building PDF…');
      try {
        const bytes = await app.buildPdf({ flatten, photoPages: withPhotos.checked });
        // An editable copy holds everything, so once it has been handed over the drawing counts as saved.
        deliver(bytes, flatten ? app.exportName('flattened') : app.doc.name, 'application/pdf', flatten ? 'Markups are part of the page and cannot be moved.' : 'Markups stay editable in Revu and other PDF apps. Saved over the original, it is the same drawing with your markups in it.', flatten ? null : () => app.markSaved());
      } catch (e) {
        console.error(e);
        alert('Export did not work', String((e && e.message) || e));
      } finally { busy(null); }
    };
    openSheet('Export', [
      h('p', { class: 'muted' }, `${n} ${n === 1 ? 'markup' : 'markups'} on ${new Set(app.markups.map(m => m.page)).size || 0} of ${app.doc.pageCount} ${app.doc.pageCount === 1 ? 'page' : 'pages'}.`),
      photos ? h('label', { class: 'switch', for: 'exp-photos' }, withPhotos, h('span', {}, `Add a page at the back for each photo (${photos})`)) : null,
      h('button', { class: 'choice', onclick: () => run(false) }, h('b', {}, 'Editable markups'), h('span', {}, 'Best for sending to the office. Revu can move, restyle and reply to each markup.')),
      h('button', { class: 'choice', onclick: () => run(true) }, h('b', {}, 'Flattened'), h('span', {}, 'Markups are burnt into the page. Nobody can move or remove them.')),
      h('button', { class: 'choice', onclick: () => app.report.open() }, h('b', {}, 'Site report'), h('span', {}, 'A numbered list of pins, notes and photos, with symbol counts. Word, PDF or Excel.')),
    ]);
  }

  // ---- drawing scale ------------------------------------------------------
  function scaleSheet() {
    if (!app.doc) return;
    const cur = app.scaleOf(app.doc.pageIndex);
    let chosen = cur;
    const custom = h('input', { type: 'text', inputmode: 'decimal', id: 'scale-custom', placeholder: 'e.g. 75', value: '' });
    const chipRow = h('div', { class: 'pop-row wide' });
    const paint = () => { for (const b of chipRow.children) b.setAttribute('aria-pressed', String(chosen != null && Math.abs(Number(b.dataset.n) * MPP_PER_RATIO - chosen) < 1e-9)); };
    for (const n of RATIOS) chipRow.append(h('button', { class: 'chip', 'data-n': n, onclick: () => { chosen = n * MPP_PER_RATIO; custom.value = ''; paint(); } }, `1:${n}`));
    paint();
    custom.addEventListener('input', () => { const v = parseFloat(custom.value); if (v > 0) { chosen = v * MPP_PER_RATIO; paint(); } });
    const apply = all => {
      if (!chosen) return toast('Pick a scale first');
      closeSheet();
      app.setScale(chosen, all);
      toast(`Scale ${scaleLabel(chosen)} on ${all ? 'every page' : 'this page'}`);
    };
    openSheet('Drawing scale', [
      h('p', { class: 'muted' }, `This page: ${scaleLabel(cur)}. The scale is the one printed on the sheet, for a PDF at its full paper size.`),
      chipRow,
      h('div', { class: 'field' }, h('label', { for: 'scale-custom' }, 'Another scale, 1 to'), custom),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => apply(false) }, 'Use on this page'),
        h('button', { class: 'btn', onclick: () => apply(true) }, 'Use on every page')),
      h('p', { class: 'muted small' }, 'No scale on the sheet, or a reduced print? Draw a Length over a dimension you know, tap it, then tap Calibrate.'),
    ]);
  }

  /** Set the scale from a line whose real length is known. */
  function calibrateSheet(m) {
    const pts = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y);
    const input = h('input', { type: 'text', inputmode: 'decimal', id: 'cal-len', placeholder: 'e.g. 3.6' });
    const apply = all => {
      const metres = parseFloat(String(input.value).replace(',', '.'));
      if (!(metres > 0) || !(pts > 0)) return toast('Type the real length in metres');
      closeSheet();
      app.setScale(metres / pts, all);
      toast(`Scale set to ${scaleLabel(metres / pts)}`);
    };
    openSheet('Calibrate', [
      h('p', {}, 'How long is this line in real life?'),
      h('div', { class: 'field' }, h('label', { for: 'cal-len' }, 'Length in metres'), input),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => apply(false) }, 'Set for this page'),
        h('button', { class: 'btn', onclick: () => apply(true) }, 'Set for every page')),
    ]);
    setTimeout(() => input.focus(), 50);
  }

  // ---- more ---------------------------------------------------------------
  function moreSheet() {
    if (app.editing) app.commitEdit();
    const item = (name, title, text, onclick) => h('button', { class: 'choice with-icon', onclick, html: `${icon(name, 26)}<span><b>${title}</b><span>${text}</span></span>` });
    openSheet('More', [
      item('list', 'Markups and report', 'Everything marked on this drawing, symbol counts, and the site report.', () => app.report.open()),
      item('search', 'Find text', 'Search every page of the drawing for a word or a number.', () => app.search.open()),
      item('scale', 'Drawing scale', `For measuring. This page: ${scaleLabel(app.scaleOf(app.doc.pageIndex))}.`, scaleSheet),
      item('doc', 'Text to Word', 'Copy the words out of this PDF into a Word file. Layout and pictures are not kept.', () => app.search.textToWord()),
      item('edit', 'Keyboard shortcuts', 'The same keys as Revu. F1 shows this list at any time.', () => app.keys.help()),
      item('settings', 'Settings', 'Your name on markups, and Pencil and finger behaviour.', settingsSheet),
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
      h('div', { class: 'field' }, h('label', { for: 'set-author' }, 'Your name on markups'), name, h('small', {}, 'Shown as the author in Revu and on the site report.')),
      h('label', { class: 'switch', for: 'set-finger' }, finger, h('span', {}, 'Draw with a finger even after using Apple Pencil')),
      h('p', { class: 'muted' }, 'With a keyboard, the keys are the same as Revu. Press F1 for the list.'),
      h('p', { class: 'muted' }, `Redline ${app.version}. ${usage} PDFs, photos and markups stay on this device.`),
    ]);
  }

  // ---- wiring -------------------------------------------------------------
  $('btn-files').addEventListener('click', () => { if (app.editing) app.commitEdit(); showHome(true); });
  $('btn-prev').addEventListener('click', () => app.goPage(app.doc.pageIndex - 1));
  $('btn-next').addEventListener('click', () => app.goPage(app.doc.pageIndex + 1));
  $('btn-pages').addEventListener('click', pagesSheet);
  $('btn-undo').addEventListener('click', () => app.undo());
  $('btn-redo').addEventListener('click', () => app.redo());
  $('btn-list').addEventListener('click', () => app.report.open());
  $('btn-more').addEventListener('click', moreSheet);
  $('btn-export').addEventListener('click', exportSheet);
  $('btn-save').addEventListener('click', () => app.files.save());
  $('btn-fit').addEventListener('click', () => app.viewer.fit());

  app.ui = { refresh, toast, hint, busy, alert, choose, showHome, openSheet, closeSheet, closePop, polyBar, deliver, scaleSheet, pagesSheet, exportSheet, settingsSheet, h };
}
