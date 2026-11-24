// Start-up and the app's shared state.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import * as PDFLib from '../vendor/pdf-lib/pdf-lib.esm.min.js';
import { makeFont } from './text.js';
import { buildShapes, TEXT_TYPES, FILL_TYPES, HEAD_TYPES, SHAPE_FILL_TYPES, MEASURE_TYPES } from './shapes.js';
import { el, drawMarkup, drawSelection, setAssets } from './render-svg.js';
import { createViewer } from './viewer.js';
import { exportPdf, importPdf } from './pdf-export.js';
import { clamp } from './geometry.js';
import * as store from './store.js';
import * as assets from './assets.js';
import { initTools, newId } from './tools.js';
import { initEditor } from './editor.js';
import { initUI } from './ui.js';
import { initKit } from './kit.js';
import { initPins } from './pins.js';
import { initForms } from './forms.js';
import { initPages } from './pages.js';
import { initSearch } from './search.js';
import { initReport } from './report.js';

const VERSION = '0.2.0';
const asset = p => new URL(p, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset('../vendor/pdfjs/pdf.worker.min.mjs');

const RED = '#e11d2a', BLUE = '#1d4ed8';
const TOOL_DEFAULTS = {
  cloud: { color: RED, fill: null, fillOpacity: 0.25, width: 2, opacity: 1, shape: 'box' },
  cloudplus: { color: RED, fill: null, fillOpacity: 0.25, textColor: RED, fontSize: 'auto', width: 2, head: 'none', border: false, opacity: 1 },
  callout: { color: RED, fill: null, textColor: RED, fontSize: 'auto', width: 2, head: 'closed', border: true, opacity: 1 },
  text: { color: RED, fill: null, textColor: RED, fontSize: 'auto', width: 1, border: false, opacity: 1 },
  arrow: { color: RED, width: 2, head: 'closed', opacity: 1 },
  pen: { color: RED, width: 2, opacity: 1 },
  hl: { color: '#facc15', width: 14, opacity: 0.45 },
  rect: { color: RED, fill: null, fillOpacity: 0.25, width: 2, opacity: 1 },
  ellipse: { color: RED, fill: null, fillOpacity: 0.25, width: 2, opacity: 1 },
  stamp: { lib: null, scale: 1, rot: 0, tint: null, opacity: 1 },
  pin: { color: RED, size: 1, opacity: 1 },
  dim: { color: BLUE, width: 1.5, fontSize: 'auto', opacity: 1 },
  path: { color: BLUE, width: 1.5, fontSize: 'auto', opacity: 1 },
  area: { color: BLUE, fill: null, fillOpacity: 0.15, width: 1.5, fontSize: 'auto', opacity: 1 },
  sig: { color: '#111111', width: 1, opacity: 1 },
};

const $ = id => document.getElementById(id);
const saved = store.loadPrefs();
const app = {
  version: VERSION, PDFLib, pdfjs, font: makeFont(PDFLib), assets,
  el: { stage: $('stage'), layer: $('layer'), base: $('base'), detail: $('detail'), svg: $('overlay'), marks: $('marks'), draft: $('draft'), sel: $('sel'), editor: $('editor'), fields: $('fields'), found: $('found') },
  doc: null,              // { id, name, pdf, bytes, pageCount, pageIndex, pageInfo, writable, password, srcSize, form, scale }
  markups: [], sel: null, tool: 'select', lock: false, editing: null, penSeen: false,
  undoStack: [], redoStack: [],
  prefs: {
    author: '', fingerDraws: false, lastDoc: null, signature: null, favourites: [], stamps: null, ...saved,
    tools: Object.fromEntries(Object.entries(TOOL_DEFAULTS).map(([k, v]) => [k, { ...v, ...((saved.tools || {})[k] || {}) }])),
  },
};
window.redline = app;     // handy for testing from the console
setAssets(assets);
app.savePrefs = () => store.savePrefs(app.prefs);

// ---- markups on screen ------------------------------------------------------
const groups = new Map();
app.getMarkup = id => app.markups.find(m => m.id === id);
app.selected = () => (app.sel ? app.getMarkup(app.sel) || null : null);
app.shapesOf = m => buildShapes(m, app.font, assets);

app.renderOne = m => {
  let g = groups.get(m.id);
  if (!g) { g = el('g', { 'data-id': m.id }); groups.set(m.id, g); app.el.marks.appendChild(g); }
  g.classList.toggle('editing', app.editing === m.id);
  drawMarkup(g, app.shapesOf(m));
};
app.renderAll = () => {
  app.el.marks.textContent = '';
  groups.clear();
  if (app.doc) for (const m of app.markups) if (m.page === app.doc.pageIndex) app.renderOne(m);
  app.renderSelection();
};
app.renderSelection = () => {
  const m = app.selected();
  const show = m && app.doc && m.page === app.doc.pageIndex;
  drawSelection(app.el.sel, show ? app.shapesOf(m) : null, 1 / app.viewer.view.scale, { editing: !!m && app.editing === m.id });
};
app.renderDraft = m => drawMarkup(app.el.draft, app.shapesOf(m), { hit: false });
app.clearDraft = () => { app.el.draft.textContent = ''; };

// ---- changes, undo ----------------------------------------------------------
let saveTimer = 0;
const metaOf = () => ({
  id: app.doc.id, name: app.doc.name, updated: Date.now(), pageCount: app.doc.pageCount, pageIndex: app.doc.pageIndex,
  markups: app.markups, writable: app.doc.writable, srcSize: app.doc.srcSize, form: app.doc.form, scale: app.doc.scale,
});
function saveNow() {
  clearTimeout(saveTimer);
  if (app.doc) store.saveDoc(metaOf()).catch(err => console.warn('autosave', err));
}
const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); };
app.saveSoon = scheduleSave;

app.changed = () => { app.renderAll(); app.ui.refresh(); scheduleSave(); };
app.pushUndo = () => {
  app.undoStack.push(JSON.stringify(app.markups));
  if (app.undoStack.length > 100) app.undoStack.shift();
  app.redoStack.length = 0;
};
app.dropUndo = () => { app.undoStack.pop(); };
function timeTravel(from, to) {
  if (!from.length) return;
  if (app.editing) app.commitEdit();
  app.tools.cancelPending();
  app.tools.abort();
  if (!from.length) return;
  to.push(JSON.stringify(app.markups));
  app.markups = JSON.parse(from.pop());
  app.sel = null;
  app.changed();
}
app.undo = () => timeTravel(app.undoStack, app.redoStack);
app.redo = () => timeTravel(app.redoStack, app.undoStack);

app.select = id => {
  if (app.sel === id) return;
  app.sel = id;
  app.renderSelection();
  app.ui.refresh();
};
app.setTool = t => {
  if (app.editing) app.commitEdit();
  app.tools.cancelPending();
  app.ui.hint(null);
  app.tool = t;
  app.el.stage.dataset.tool = t;
  if (t !== 'select') app.sel = null;
  app.renderSelection();
  app.ui.refresh();
  if (MEASURE_TYPES.has(t) && app.doc && !app.scaleOf(app.doc.pageIndex)) app.ui.scaleSheet();
};
app.deleteSelected = () => {
  const m = app.selected();
  if (!m) return;
  if (app.editing) app.commitEdit();
  if (!app.getMarkup(m.id)) return;
  app.pushUndo();
  app.markups = app.markups.filter(x => x.id !== m.id);
  app.sel = null;
  app.changed();
};
app.duplicateSelected = () => {
  const m = app.selected();
  if (!m) return;
  if (app.editing) app.commitEdit();
  app.pushUndo();
  const c = JSON.parse(JSON.stringify(m));
  c.id = newId();
  const d = 14 * m.k;
  for (const p of [c.rect, c.tip, c.p, c.p1, c.p2]) if (p) { p.x += d; p.y += d; }
  if (c.box) { c.box.ax += d; c.box.ay += d; }
  if (c.pts) for (const p of c.pts) { p[0] += d; p[1] += d; }
  if (c.type === 'pin') c.n = app.nextPin();
  app.markups.push(c);
  app.sel = c.id;
  app.changed();
};
app.nextPin = () => Math.max(0, ...app.markups.filter(m => m.type === 'pin').map(m => m.n || 0)) + 1;

// ---- styles -----------------------------------------------------------------
/** The look a new markup gets on this page, from the tool's remembered options. */
app.newStyle = tool => {
  const d = app.prefs.tools[tool], k = app.doc.pageInfo.k;
  const s = { k, color: d.color, opacity: d.opacity ?? 1, width: (d.width ?? 2) * k };
  if (FILL_TYPES.has(tool)) s.fill = d.fill ?? null;
  if (SHAPE_FILL_TYPES.has(tool)) s.fillOpacity = d.fillOpacity ?? 0.25;
  if (TEXT_TYPES.has(tool)) { s.textColor = d.textColor; s.fontSize = d.fontSize === 'auto' ? 12 * k : d.fontSize; s.border = !!d.border; }
  if (MEASURE_TYPES.has(tool)) { s.fontSize = d.fontSize === 'auto' ? 10 * k : d.fontSize; s.mpp = app.scaleOf(app.doc.pageIndex); }
  if (HEAD_TYPES.has(tool)) s.head = d.head;
  return s;
};
app.propValue = key => {
  const m = app.selected();
  if (!m) return (app.prefs.tools[app.tool] || {})[key] ?? null;
  if (key === 'width') return Math.round((m.width / m.k) * 100) / 100;
  if (key === 'fillOpacity') return m.fillOpacity ?? (m.type === 'area' ? 0.15 : 1);
  if (key === 'scale') return m.nw ? Math.round((m.rect.w / m.nw) * 100) / 100 : 1;
  if (key === 'rot') return m.rot || 0;
  if (key === 'size') return m.size ?? 1;
  return m[key] ?? null;
};
app.setProp = (key, value) => {
  const m = app.selected(), type = m ? m.type : app.tool;
  if (!app.prefs.tools[type]) return;
  app.prefs.tools[type][key] = value;
  if (type === 'text' && key === 'textColor') app.prefs.tools.text.color = value;
  store.savePrefs(app.prefs);
  if (!m) { if (key === 'shape') app.tools.cancelPending({ discard: true }); return app.ui.refresh(); }
  app.pushUndo();
  if (key === 'width') m.width = value * m.k;
  else if (key === 'fontSize') m.fontSize = value === 'auto' ? (MEASURE_TYPES.has(m.type) ? 10 : 12) * m.k : value;
  else if (key === 'scale') {
    const r = m.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2, w = (m.nw || r.w) * value, h = (m.nh || r.h) * value;
    m.rect = { x: cx - w / 2, y: cy - h / 2, w, h };
  } else m[key] = value;
  if (m.type === 'text' && key === 'textColor') m.color = value;
  app.changed();
  if (app.editing === m.id) app.editorReposition();
};

// ---- drawing scale ----------------------------------------------------------
/** Metres per page point on a page, or null if no scale has been set. */
app.scaleOf = i => (app.doc ? (app.doc.scale.pages[i] ?? app.doc.scale.def ?? null) : null);
app.setScale = (mpp, allPages) => {
  const sc = app.doc.scale, here = app.doc.pageIndex;
  if (allPages) { sc.def = mpp; sc.pages = {}; } else sc.pages[here] = mpp;
  const touched = app.markups.filter(m => MEASURE_TYPES.has(m.type) && (allPages || m.page === here) && m.mpp !== mpp);
  if (touched.length) { app.pushUndo(); for (const m of touched) m.mpp = app.scaleOf(m.page); }
  app.changed();
};

// ---- documents --------------------------------------------------------------
/** Free a pdf.js document (newer pdf.js closes it through its loading task). */
function closePdf(pdf) {
  try {
    const p = pdf.destroy ? pdf.destroy() : pdf.loadingTask.destroy();
    if (p && p.catch) p.catch(() => {});
  } catch { /* already closed */ }
}

async function loadPdfjs(bytes, doc) {
  const task = pdfjs.getDocument({
    data: bytes.slice(),                 // pdf.js takes ownership of the buffer it is given
    standardFontDataUrl: asset('../vendor/pdfjs/standard_fonts/'),
    wasmUrl: asset('../vendor/pdfjs/wasm/'),
    iccUrl: asset('../vendor/pdfjs/iccs/'),
    isEvalSupported: false,
  });
  task.onPassword = (give, reason) => {
    const pw = window.prompt(reason === 2 ? 'That password did not work. Try again:' : 'This PDF needs a password:');
    if (pw == null) { task.destroy(); return; }
    doc.password = pw;
    give(pw);
  };
  return task.promise;
}
app.loadPdfjs = bytes => loadPdfjs(bytes, { password: app.doc && app.doc.password });
app.closePdf = closePdf;

async function showDoc(meta, bytes, pdf) {
  const old = app.doc;
  const doc = {
    id: meta.id, name: meta.name, bytes, pdf: null, pageCount: 0, pageIndex: 0, pageInfo: null,
    writable: meta.writable !== false, password: meta.password, srcSize: meta.srcSize,
    form: meta.form || {}, scale: { def: null, pages: {}, ...(meta.scale || {}) },
  };
  doc.pdf = pdf || await loadPdfjs(bytes, doc);
  doc.pageCount = doc.pdf.numPages;
  doc.pageIndex = clamp(meta.pageIndex || 0, 0, doc.pageCount - 1);
  await assets.load(assets.idsOf(meta.markups));
  if (app.editing) app.commitEdit();
  app.tools.cancelPending({ discard: true });
  saveNow();
  app.doc = doc;
  app.markups = meta.markups || [];
  app.sel = null; app.undoStack = []; app.redoStack = [];
  app.tool = 'select'; app.el.stage.dataset.tool = 'select';
  app.viewer.setDocument(doc.pdf);
  app.search.reset();
  app.forms.reset();
  app.ui.showHome(false);
  app.ui.closeSheet();
  await app.goPage(doc.pageIndex);
  app.prefs.lastDoc = doc.id;
  store.savePrefs(app.prefs);
  if (old && old.pdf) closePdf(old.pdf);
}

app.openBytes = async (name, bytes) => {
  app.ui.busy('Opening…');
  try {
    // Already on this device? Carry on where it was left.
    const twin = (await store.listDocs().catch(() => [])).find(d => d.name === name && d.srcSize === bytes.length);
    if (twin) { await app.openStored(twin.id); return; }
    const probe = { password: undefined };
    const pdf = await loadPdfjs(bytes, probe);
    const imp = await importPdf(PDFLib, bytes, probe.password);
    for (const a of imp.assets || []) await assets.put(a);
    const changed = imp.baseBytes !== bytes;
    const meta = { id: newId(), name, pageIndex: 0, markups: imp.markups, writable: imp.writable, password: probe.password, srcSize: bytes.length };
    // Measurements carry the scale they were made at: pick the drawing scale back up from them.
    const scaled = imp.markups.filter(m => MEASURE_TYPES.has(m.type) && m.mpp);
    if (scaled.length) meta.scale = { def: scaled[0].mpp, pages: Object.fromEntries(scaled.map(m => [m.page, m.mpp])) };
    await store.saveFile(meta.id, imp.baseBytes.buffer.slice(imp.baseBytes.byteOffset, imp.baseBytes.byteOffset + imp.baseBytes.byteLength)).catch(err => console.warn('could not keep a copy', err));
    if (changed) { closePdf(pdf); await showDoc(meta, imp.baseBytes); }
    else await showDoc(meta, imp.baseBytes, pdf);
    saveNow();
    if (!imp.writable) app.ui.alert('View only', 'Redline can show this PDF but cannot write markups into it. Re-save it from Revu, or print it to a new PDF, to mark it up.');
    else if (imp.secured) app.ui.alert('This PDF is locked by its author', 'Whoever made it set it to block changes. Redline can still add your markups, but the copy you export will not carry that lock. Only go ahead if you are allowed to mark up this drawing.');
    else if (imp.markups.length) app.ui.toast(`${imp.markups.length} Redline markups are editable again`);
  } catch (e) {
    console.error(e);
    app.ui.alert('That file would not open', e && e.name === 'PasswordException' ? 'A password is needed to open it.' : 'It may not be a PDF, or it may be damaged.');
  } finally { app.ui.busy(null); }
};

app.openStored = async id => {
  app.ui.busy('Opening…');
  try {
    const [meta, buf] = await Promise.all([store.getDoc(id), store.loadFile(id)]);
    if (!meta || !buf) throw new Error('missing');
    await showDoc(meta, new Uint8Array(buf));
  } catch (e) {
    console.error(e);
    app.ui.alert('That file would not open', 'It is no longer stored on this device.');
    app.ui.showHome(true);
  } finally { app.ui.busy(null); }
};

app.removeStored = async id => {
  await store.removeDoc(id);
  if (app.doc && app.doc.id === id) {
    clearTimeout(saveTimer);
    closePdf(app.doc.pdf);
    app.doc = null; app.markups = []; app.sel = null; app.undoStack = []; app.redoStack = [];
    app.prefs.lastDoc = null; store.savePrefs(app.prefs);
    app.renderAll();
    app.forms.reset();
    app.ui.refresh();
  }
  assets.sweep();
};

/**
 * Swap the open drawing's pages for an edited set (pages turned, added, removed, moved).
 * The markups given are already on their new pages; undo history does not survive this.
 */
app.replaceBytes = async (bytes, markups, pageIndex) => {
  const doc = app.doc, old = doc.pdf;
  if (app.editing) app.commitEdit();
  app.tools.cancelPending({ discard: true });
  doc.bytes = bytes;
  doc.pdf = await loadPdfjs(bytes, doc);
  doc.pageCount = doc.pdf.numPages;
  app.markups = markups;
  app.sel = null; app.undoStack = []; app.redoStack = [];
  app.viewer.setDocument(doc.pdf);
  app.search.reset();
  app.forms.reset();
  await store.saveFile(doc.id, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).catch(err => console.warn('could not keep the new pages', err));
  await app.goPage(clamp(pageIndex, 0, doc.pageCount - 1));
  saveNow();
  closePdf(old);
};

app.goPage = async i => {
  if (app.editing) app.commitEdit();
  app.tools.cancelPending();
  const doc = app.doc;
  doc.pageIndex = clamp(i, 0, doc.pageCount - 1);
  app.sel = null;
  app.el.marks.textContent = ''; groups.clear(); app.el.sel.textContent = '';
  app.el.fields.textContent = ''; app.el.found.textContent = '';
  doc.pageInfo = await app.viewer.showPage(doc.pageIndex);
  if (app.doc !== doc) return;
  app.renderAll();
  app.forms.render();
  app.search.render();
  app.ui.refresh();
  scheduleSave();
};

/** Show a markup: go to its page, select it and bring it to the middle of the screen. */
app.reveal = async m => {
  if (m.page !== app.doc.pageIndex) await app.goPage(m.page);
  if (app.tool !== 'select') app.setTool('select');
  app.select(m.id);
  const b = app.shapesOf(m).bbox, st = app.el.stage.getBoundingClientRect(), v = app.viewer.view;
  const scale = Math.max(v.scale, Math.min(app.viewer.fitScale * 2.5, 3));
  app.viewer.setView({ scale, tx: st.width / 2 - (b.x + b.w / 2) * scale, ty: st.height / 2 - (b.y + b.h / 2) * scale }, { settle: true });
};

app.buildPdf = async ({ flatten = false, photoPages = true, markups = app.markups, bytes = app.doc.bytes } = {}) => {
  const matrices = {};
  for (const p of new Set(markups.map(m => m.page))) matrices[p] = (await app.viewer.pageInfo(p)).matrix;
  await assets.load(assets.idsOf(markups));
  return exportPdf(PDFLib, bytes, markups, {
    font: app.font, author: app.prefs.author || 'Redline', flatten, matrices, password: app.doc.password,
    assets, form: app.doc.form, photoPages, title: app.doc.name.replace(/\.pdf$/i, ''),
  });
};
app.exportName = (suffix = 'markup', ext = 'pdf') => {
  const base = app.doc.name.replace(/\.pdf$/i, '').replace(/ \((markup|report|text|pages)\)$/i, '');
  return `${base} (${suffix}).${ext}`;
};

// ---- start ------------------------------------------------------------------
async function start() {
  app.viewer = createViewer(app.el, () => { app.renderSelection(); if (app.editing) app.editorReposition(); });
  initUI(app);
  initTools(app);
  initEditor(app);
  initKit(app);
  initPins(app);
  initForms(app);
  initPages(app);
  initSearch(app);
  initReport(app);
  app.ui.refresh();

  $('file').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await app.openBytes(f.name, new Uint8Array(await f.arrayBuffer()));
  });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    const kit = files.find(x => /\.(redlinekit|json)$/i.test(x.name));
    if (kit) return app.kit.importFile(kit);
    const f = files.find(x => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name));
    if (f) await app.openBytes(f.name, new Uint8Array(await f.arrayBuffer()));
  });
  window.addEventListener('resize', () => app.viewer.resized());
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);
  store.keepStorage();

  const q = new URLSearchParams(location.search).get('open');     // for testing: ?open=some.pdf on this site
  try {
    if (q && new URL(q, location.href).origin === location.origin) {
      const r = await fetch(q);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await app.openBytes(decodeURIComponent(q.split('/').pop()), new Uint8Array(await r.arrayBuffer()));
    } else if (app.prefs.lastDoc && await store.getDoc(app.prefs.lastDoc)) {
      await app.openStored(app.prefs.lastDoc);
    } else {
      app.ui.showHome(true);
    }
  } catch (e) {
    console.error(e);
    app.ui.showHome(true);
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('offline cache not set up', err));
  }
}
start();
