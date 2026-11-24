// Start-up and the app's shared state.
import * as pdfjs from '../vendor/pdfjs/pdf.min.mjs';
import * as PDFLib from '../vendor/pdf-lib/pdf-lib.esm.min.js';
import { makeFont } from './text.js';
import { buildShapes, translate, TEXT_TYPES, FILL_TYPES, HEAD_TYPES, SHAPE_FILL_TYPES, MEASURE_TYPES, DASH_TYPES, statusOf, pinColour } from './shapes.js';
import { el, drawMarkup, drawSelection, drawPicked, setAssets } from './render-svg.js';
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
import { initFiles } from './files.js';
import { initKeys } from './keys.js';
import { initBackup } from './backup.js';
import { initCompare } from './compare.js';

const VERSION = '0.5.0';
const asset = p => new URL(p, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = asset('../vendor/pdfjs/pdf.worker.min.mjs');

const RED = '#e11d2a', BLUE = '#1d4ed8';
const TOOL_DEFAULTS = {
  cloud: { color: RED, fill: null, fillOpacity: 0.25, width: 2, opacity: 1, shape: 'box' },
  cloudplus: { color: RED, fill: null, fillOpacity: 0.25, textColor: RED, fontSize: 'auto', width: 2, head: 'none', border: false, opacity: 1 },
  callout: { color: RED, fill: null, textColor: RED, fontSize: 'auto', width: 2, head: 'closed', border: true, opacity: 1 },
  text: { color: RED, fill: null, textColor: RED, fontSize: 'auto', width: 1, border: false, opacity: 1 },
  arrow: { color: RED, width: 2, head: 'closed', opacity: 1 },
  line: { color: RED, width: 2, opacity: 1 },
  polyline: { color: RED, width: 2, head: 'none', opacity: 1 },
  polygon: { color: RED, fill: null, fillOpacity: 0.25, width: 2, opacity: 1 },
  eraser: { size: 1 },
  pen: { color: RED, width: 2, opacity: 1 },
  hl: { color: '#facc15', width: 14, opacity: 0.45 },
  rect: { color: RED, fill: null, fillOpacity: 0.25, width: 2, opacity: 1 },
  ellipse: { color: RED, fill: null, fillOpacity: 0.25, width: 2, opacity: 1 },
  stamp: { lib: null, scale: 1, rot: 0, mode: 'markup', markColor: RED, altColor: '#db2777', opacity: 1, row: 1 },
  count: { color: '#16a34a', size: 1, label: '' },
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
  markups: [], tool: 'select', lock: false, editing: null, penSeen: false,
  undoStack: [], redoStack: [],
  prefs: {
    author: '', fingerDraws: false, lastDoc: null, signature: null, favourites: [], stamps: null, snap: true,
    report: { title: 'Site report', company: '', logo: null }, ...saved,
    tools: Object.fromEntries(Object.entries(TOOL_DEFAULTS).map(([k, v]) => [k, { ...v, ...((saved.tools || {})[k] || {}) }])),
  },
};
window.redline = app;     // handy for testing from the console
setAssets(assets);
app.savePrefs = () => store.savePrefs(app.prefs);
{
  // The L key used to turn the Arrow tool into a line by taking its head off. Line is now a tool of its own.
  const a = app.prefs.tools.arrow;
  if (a.lastHead) { if (a.head === 'none') a.head = a.lastHead; delete a.lastHead; }
}

// ---- what is picked -----------------------------------------------------------
// One markup or several. `app.sel` is the id when exactly one is picked, which is all most of the app asks about.
let picks = [];
Object.defineProperty(app, 'sel', { get: () => (picks.length === 1 ? picks[0] : null), set: id => { picks = id ? [id] : []; } });

// ---- markups on screen ------------------------------------------------------
const groups = new Map();
app.getMarkup = id => app.markups.find(m => m.id === id);
app.selected = () => (app.sel ? app.getMarkup(app.sel) || null : null);
/** Everything that is picked: one markup, several, or none. */
app.picked = () => picks.map(app.getMarkup).filter(Boolean);
app.shapesOf = m => buildShapes(m, app.font, assets);
const unionBox = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; };

app.renderOne = m => {
  let g = groups.get(m.id);
  if (!g) { g = el('g', { 'data-id': m.id }); groups.set(m.id, g); app.el.marks.appendChild(g); }
  g.classList.toggle('editing', app.editing === m.id);
  drawMarkup(g, app.shapesOf(m));
};
/** Take one markup off the screen: it has been removed or replaced. */
app.dropOne = id => { const g = groups.get(id); if (g) { g.remove(); groups.delete(id); } };
app.renderAll = () => {
  app.el.marks.textContent = '';
  groups.clear();
  if (app.doc) for (const m of app.markups) if (m.page === app.doc.pageIndex) app.renderOne(m);
  app.renderSelection();
};
app.renderSelection = () => {
  const px = 1 / app.viewer.view.scale;
  const ms = app.doc ? app.picked().filter(m => m.page === app.doc.pageIndex) : [];
  // Several at once, or anything picked with the lasso: outlines only, no handles.
  if (ms.length > 1 || (ms.length === 1 && app.tool === 'lasso')) return drawPicked(app.el.sel, ms.map(m => app.shapesOf(m).bbox), px);
  const m = ms[0];
  drawSelection(app.el.sel, m ? app.shapesOf(m) : null, px, { editing: !!m && app.editing === m.id });
};
app.renderDraft = m => drawMarkup(app.el.draft, app.shapesOf(m), { hit: false });
/** Several things at once in the draft layer: a row of symbols, or a symbol and its guide lines. */
app.renderDrafts = list => {
  app.el.draft.textContent = '';
  for (const m of list) { const g = el('g'); app.el.draft.appendChild(g); drawMarkup(g, app.shapesOf(m), { hit: false }); }
};
app.clearDraft = () => { app.el.draft.textContent = ''; };

// ---- changes, undo ----------------------------------------------------------
let saveTimer = 0;
const metaOf = () => ({
  id: app.doc.id, name: app.doc.name, updated: Date.now(), pageCount: app.doc.pageCount, pageIndex: app.doc.pageIndex,
  markups: app.markups, writable: app.doc.writable, srcSize: app.doc.srcSize, form: app.doc.form, scale: app.doc.scale, job: app.doc.job,
  dirty: !!app.doc.dirty, handle: app.doc.handle || undefined, fileTime: app.doc.fileTime || undefined,
  fp: app.doc.fp || undefined, changedAt: app.doc.changedAt || undefined,
});
function saveNow() {
  clearTimeout(saveTimer);
  if (app.doc) store.saveDoc(metaOf()).catch(err => console.warn('autosave', err));
}
const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 400); };
app.saveSoon = scheduleSave;

const touched = () => { if (app.doc) { app.doc.dirty = true; app.doc.changedAt = Date.now(); } };
app.changed = () => { touched(); app.renderAll(); app.ui.refresh(); scheduleSave(); };
/** Something other than a markup changed (a form answer): remember it, and that the drawing now differs from its file. */
app.touch = () => { touched(); app.ui.refresh(); scheduleSave(); };
/** The drawing as it stands has just been written to a file or exported. */
app.markSaved = size => { if (!app.doc) return; app.doc.dirty = false; if (size) app.doc.srcSize = size; app.ui.refresh(); saveNow(); };
app.saveNow = saveNow;
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

/** A markup and everything grouped with it. */
const withGroup = m => (m.group ? app.markups.filter(x => x.group === m.group && x.page === m.page) : [m]);
function pick(ids) {
  if (ids.length === picks.length && ids.every((id, i) => id === picks[i])) return;
  picks = ids;
  app.renderSelection();
  app.ui.refresh();
}
/** Pick one markup (with its group, if it is in one), or nothing. */
app.select = id => { const m = id ? app.getMarkup(id) : null; pick(m ? withGroup(m).map(x => x.id) : []); };
/** Pick several markups at once. Anything grouped brings the rest of its group. */
app.selectMany = ids => {
  const want = new Set();
  for (const id of ids) { const m = app.getMarkup(id); if (m) for (const x of withGroup(m)) want.add(x.id); }
  pick(app.markups.filter(m => want.has(m.id)).map(m => m.id));
};
/** Add a markup (and its group) to what is picked, or take it out again. */
app.toggleSelect = id => {
  const m = app.getMarkup(id);
  if (!m) return;
  const ids = withGroup(m).map(x => x.id);
  app.selectMany(ids.every(x => picks.includes(x)) ? picks.filter(x => !ids.includes(x)) : [...picks, ...ids]);
};
app.selectAll = () => {
  if (!app.doc) return;
  if (app.editing) app.commitEdit();
  if (app.tool !== 'select' && app.tool !== 'lasso') app.setTool('select');
  app.selectMany(app.markups.filter(m => m.page === app.doc.pageIndex).map(m => m.id));
};
app.setTool = t => {
  if (app.editing) app.commitEdit();
  app.tools.cancelPending();
  app.ui.hint(null);
  app.clearDraft();
  if (t !== app.tool) app.tools.resetCount();
  app.tool = t;
  app.el.stage.dataset.tool = t;
  if (t !== 'select' && t !== 'lasso') app.sel = null;
  app.renderSelection();
  app.ui.refresh();
  if (MEASURE_TYPES.has(t) && app.doc && !app.scaleOf(app.doc.pageIndex)) app.ui.scaleSheet();
};
app.deleteSelected = () => {
  if (!picks.length) return;
  if (app.editing) app.commitEdit();
  const gone = new Set(app.picked().map(m => m.id));
  if (!gone.size) return;
  app.pushUndo();
  app.markups = app.markups.filter(x => !gone.has(x.id));
  app.sel = null;
  app.changed();
};
app.nextPin = () => Math.max(0, ...app.markups.filter(m => m.type === 'pin').map(m => m.n || 0)) + 1;
/** Copies of markups with ids of their own. Copies of a group are a group of their own; pins take the next numbers. */
function copiesOf(list, page = null) {
  const groupIds = new Map();
  let pin = app.nextPin();
  return list.map(m => {
    const c = JSON.parse(JSON.stringify(m));
    c.id = newId();
    if (page != null) c.page = page;
    if (c.group) { if (!groupIds.has(c.group)) groupIds.set(c.group, newId()); c.group = groupIds.get(c.group); }
    if (c.type === 'pin') c.n = pin++;
    return c;
  });
}
app.duplicateSelected = () => {
  if (!picks.length) return;
  if (app.editing) app.commitEdit();
  const src = app.picked();
  if (!src.length) return;
  app.pushUndo();
  const copies = copiesOf(src);
  for (const c of copies) translate(c, 14 * c.k, 14 * c.k);
  app.markups.push(...copies);
  picks = copies.map(c => c.id);
  app.changed();
};

// ---- copy and paste, nudging, order -------------------------------------------
let clip = [];
app.copySelected = () => { const ms = app.picked(); if (ms.length) clip = JSON.parse(JSON.stringify(ms)); return ms.length > 0; };
app.cutSelected = () => { if (app.copySelected()) app.deleteSelected(); };
/** Paste what was copied onto the page in view: where it was (`inPlace`), or in the middle of the screen. */
app.paste = inPlace => {
  if (!clip.length || !app.doc) return;
  if (app.editing) app.commitEdit();
  const copies = copiesOf(clip, app.doc.pageIndex);
  if (!inPlace) {
    const b = copies.map(c => app.shapesOf(c).bbox).reduce(unionBox), st = app.el.stage.getBoundingClientRect(), v = app.viewer.view, s = app.viewer.size;
    const cx = clamp((st.width / 2 - v.tx) / v.scale, 0, s.w), cy = clamp((st.height / 2 - v.ty) / v.scale, 0, s.h);
    for (const c of copies) translate(c, cx - (b.x + b.w / 2), cy - (b.y + b.h / 2));
  }
  app.pushUndo();
  app.markups.push(...copies);
  if (app.tool !== 'select' && app.tool !== 'lasso') app.setTool('select');
  picks = copies.map(c => c.id);
  app.changed();
};
app.nudge = (dx, dy) => {
  if (!picks.length) return;
  if (app.editing) app.commitEdit();
  const ms = app.picked();
  if (!ms.length) return;
  app.pushUndo();
  for (const m of ms) translate(m, dx, dy);
  app.changed();
};
/** Move what is picked in front of or behind the other markups on its page: 'up', 'down', 'front' or 'back'. */
app.reorder = where => {
  const ms = app.picked();
  if (!ms.length) return;
  const page = ms[0].page, set = new Set(ms), was = app.markups.filter(x => x.page === page);
  let peers = was.slice();
  if (where === 'front') peers = [...peers.filter(x => !set.has(x)), ...peers.filter(x => set.has(x))];
  else if (where === 'back') peers = [...peers.filter(x => set.has(x)), ...peers.filter(x => !set.has(x))];
  else if (where === 'up') { for (let i = peers.length - 2; i >= 0; i--) if (set.has(peers[i]) && !set.has(peers[i + 1])) [peers[i], peers[i + 1]] = [peers[i + 1], peers[i]]; }
  else for (let i = 1; i < peers.length; i++) if (set.has(peers[i]) && !set.has(peers[i - 1])) [peers[i], peers[i - 1]] = [peers[i - 1], peers[i]];
  if (peers.every((x, i) => x === was[i])) return;
  app.pushUndo();
  let k = 0;
  app.markups = app.markups.map(x => (x.page === page ? peers[k++] : x));
  app.changed();
};

// ---- several at once: group, line up, space out ---------------------------------
app.group = () => {
  if (app.editing) app.commitEdit();
  const ms = app.picked();
  if (ms.length < 2) return;
  app.pushUndo();
  const id = newId();
  for (const m of ms) m.group = id;
  app.changed();
  app.ui.toast(`${ms.length} markups grouped. They now move as one.`);
};
app.ungroup = () => {
  const ms = app.picked().filter(m => m.group);
  if (!ms.length) return;
  app.pushUndo();
  for (const m of ms) delete m.group;
  app.changed();
  app.ui.toast('Ungrouped');
};
const boxOf = m => (m.type === 'stamp' ? m.rect : app.shapesOf(m).bbox);
/** What gets lined up: each group as one piece, each loose markup on its own. One group by itself lines up its members. */
function pieces() {
  const ms = app.picked(), by = new Map();
  for (const m of ms) { const key = m.group || m.id; by.set(key, [...(by.get(key) || []), m]); }
  const list = by.size === 1 ? ms.map(m => [m]) : [...by.values()];
  return list.map(members => ({ members, box: members.map(boxOf).reduce(unionBox) }));
}
/** Line up what is picked: to the 'left', 'centre', 'right', 'top', 'middle' or 'bottom' of the space it takes up. */
app.align = how => {
  if (app.editing) app.commitEdit();
  const ps = pieces();
  if (ps.length < 2) return;
  const all = ps.map(p => p.box).reduce(unionBox);
  app.pushUndo();
  for (const { members, box } of ps) {
    const dx = how === 'left' ? all.x - box.x : how === 'right' ? all.x + all.w - box.x - box.w : how === 'centre' ? all.x + all.w / 2 - box.x - box.w / 2 : 0;
    const dy = how === 'top' ? all.y - box.y : how === 'bottom' ? all.y + all.h - box.y - box.h : how === 'middle' ? all.y + all.h / 2 - box.y - box.h / 2 : 0;
    for (const m of members) translate(m, dx, dy);
  }
  app.changed();
};
/** Space what is picked evenly between the two outermost: 'across' or 'down'. */
app.spread = dir => {
  if (app.editing) app.commitEdit();
  const ax = dir === 'across' ? 'x' : 'y', sz = dir === 'across' ? 'w' : 'h';
  const mid = p => p.box[ax] + p.box[sz] / 2;
  const ps = pieces().sort((a, b) => mid(a) - mid(b));
  if (ps.length < 3) return app.ui.toast('Pick three or more to space them evenly');
  const first = mid(ps[0]), step = (mid(ps[ps.length - 1]) - first) / (ps.length - 1);
  app.pushUndo();
  ps.forEach((p, i) => { const d = first + step * i - mid(p); for (const m of p.members) translate(m, ax === 'x' ? d : 0, ax === 'y' ? d : 0); });
  app.changed();
};
app.selectNext = dir => {
  if (!app.doc) return;
  const list = app.markups.filter(m => m.page === app.doc.pageIndex);
  if (!list.length) return;
  if (app.editing) app.commitEdit();
  // Step on from what is picked now to the next markup that is not part of it (a group counts as one stop).
  const cur = app.picked(), n = list.length;
  let i = cur.length ? list.indexOf(cur[dir > 0 ? cur.length - 1 : 0]) : dir > 0 ? -1 : n, next = null;
  for (let step = 0; step < n && !next; step++) { i = (i + dir + n) % n; if (!cur.includes(list[i])) next = list[i]; }
  if (!next) return;
  if (app.tool !== 'select') app.setTool('select');
  app.select(next.id);
};

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
  if (d.dash && d.dash !== 'solid' && (DASH_TYPES.has(tool) || tool === 'line')) s.dash = d.dash;
  return s;
};
/** One markup's value for an option that several markups can share, or undefined where the option means nothing to it. */
const sharedValue = (m, key) => {
  if (key === 'color') return m.type === 'stamp' ? (app.kit.canTint(m) ? m.tint || null : undefined) : m.type === 'pin' ? pinColour(m) : m.color;
  if (key === 'width') return m.width != null && m.type !== 'hl' && m.type !== 'sig' ? Math.round((m.width / m.k) * 100) / 100 : undefined;
  if (key === 'dash') return DASH_TYPES.has(m.type) ? m.dash || 'solid' : undefined;
  if (key === 'opacity') return m.opacity ?? 1;
  return undefined;
};
app.sharedValue = sharedValue;
function setShared(ms, key, value) {
  app.pushUndo();
  for (const m of ms) {
    if (sharedValue(m, key) === undefined) continue;
    if (key === 'color') {
      if (m.type === 'stamp') m.tint = value;
      else if (m.type === 'pin') { if (statusOf(m) === 'open') m.color = value; }
      else { m.color = value; if (TEXT_TYPES.has(m.type)) m.textColor = value; }
    } else if (key === 'width') m.width = value * m.k;
    else if (key === 'dash') { if (value === 'solid') delete m.dash; else m.dash = value; }
    else if (key === 'opacity') m.opacity = value;
  }
  app.changed();
}
app.propValue = key => {
  if (picks.length > 1) {
    // Several picked: the value they all share, or null when they differ.
    const vals = app.picked().map(m => sharedValue(m, key)).filter(v => v !== undefined);
    return vals.length && vals.every(v => v === vals[0]) ? vals[0] : null;
  }
  const m = app.selected();
  if (key === 'dash') return (m ? m.dash : (app.prefs.tools[app.tool] || {}).dash) || 'solid';
  if (!m && app.tool === 'stamp' && key === 'markColor') return app.kit.currentTint() || app.prefs.tools.stamp.markColor;
  if (!m) return (app.prefs.tools[app.tool] || {})[key] ?? null;
  if (key === 'width') return Math.round((m.width / m.k) * 100) / 100;
  if (key === 'fillOpacity') return m.fillOpacity ?? (m.type === 'area' ? 0.15 : 1);
  if (key === 'scale') return m.nw ? Math.round((m.rect.w / m.nw) * 100) / 100 : 1;
  if (key === 'rot') return m.rot || 0;
  if (key === 'status') return m.status || 'open';
  if (key === 'mode' && m.type === 'stamp') return m.tint ? 'markup' : 'design';
  if (key === 'markColor' && m.type === 'stamp') return m.tint || app.prefs.tools.stamp.markColor;
  if (key === 'size') return m.size ?? 1;
  return m[key] ?? null;
};
app.setProp = (key, value) => {
  if (picks.length > 1) return setShared(app.picked(), key, value);
  const m = app.selected();
  // A line is an arrow with no head: its options are remembered for the Line tool, not the Arrow tool.
  const type = m ? (m.type === 'arrow' && m.head === 'none' && key !== 'head' ? 'line' : m.type) : app.tool;
  if (!app.prefs.tools[type]) return;
  if (type === 'stamp' && (key === 'mode' || key === 'markColor')) {
    // Markup or Design, and the markup colour: remembered for the next symbols, applied to the one selected.
    const d = app.prefs.tools.stamp;
    if (key === 'mode') d.mode = value; else app.kit.rememberColour(value, m);
    store.savePrefs(app.prefs);
    if (!m) return app.ui.refresh();
    app.pushUndo();
    m.tint = key === 'markColor' ? value : value === 'design' ? null : app.kit.markupTint(m.sym);
    return app.changed();
  }
  // Taking the head off one arrow does not turn the Arrow tool into a line tool.
  if (!(m && m.type === 'arrow' && key === 'head' && value === 'none')) app.prefs.tools[type][key] = value;
  if (type === 'text' && key === 'textColor') app.prefs.tools.text.color = value;
  store.savePrefs(app.prefs);
  if (!m) { if (key === 'shape') app.tools.cancelPending({ discard: true }); return app.ui.refresh(); }
  app.pushUndo();
  if (key === 'width') m.width = value * m.k;
  else if (key === 'status') { m.status = value; m.statusAt = Date.now(); }
  else if (key === 'dash') { if (value === 'solid') delete m.dash; else m.dash = value; }
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
    form: meta.form || {}, scale: { def: null, pages: {}, ...(meta.scale || {}) }, job: { number: '', address: '', ...(meta.job || {}) },
    // dirty = it has changes that are not in any file yet. Drawings from before this was tracked count as changed if marked up.
    dirty: meta.dirty ?? (meta.markups || []).length > 0, handle: meta.handle || null, fileTime: meta.fileTime || null,
    fp: meta.fp || null, changedAt: meta.changedAt || meta.updated || null,
  };
  doc.pdf = pdf || await loadPdfjs(bytes, doc);
  doc.pageCount = doc.pdf.numPages;
  doc.pageIndex = clamp(meta.pageIndex || 0, 0, doc.pageCount - 1);
  if (!doc.fp) doc.fp = (doc.pdf.fingerprints || [])[0] || null;
  await assets.load(assets.idsOf(meta.markups));
  if (app.editing) app.commitEdit();
  app.tools.cancelPending({ discard: true });
  saveNow();
  app.doc = doc;
  app.markups = meta.markups || [];
  app.sel = null; app.undoStack = []; app.redoStack = [];
  app.tool = 'select'; app.el.stage.dataset.tool = 'select';
  if (app.compare) app.compare.stop();
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

// One drawing opens at a time: a file handed over while another is still loading waits its turn.
let opening = Promise.resolve();
const inTurn = fn => { const p = opening.then(fn, fn); opening = p.catch(() => {}); return p; };

/**
 * Open a PDF. `handle` (PC only) is the file it came from, so Save can write back into it; `modified` is when
 * the file was last changed.
 *
 * The same drawing may already be on this device. "The same" means the same file name and the same PDF identity
 * (the ID inside the file, which stays with it through every save), so that two different E101.pdf from two jobs
 * are never taken for each other. Then:
 *   - the very same file: carry on where it was left
 *   - a different version, and the copy here has unsaved work: ask
 *   - a different version that is older than the last change made here: carry on with the copy here
 *   - otherwise the file is the newer one and takes the place of the copy here
 */
app.openBytes = (name, bytes, { handle = null, modified = 0 } = {}) => inTurn(async () => {
  app.ui.busy('Opening…');
  const probe = { password: undefined };
  let pdf = null;
  try {
    // What is on screen may have changed a moment ago: put it on record first, so the check below sees it.
    clearTimeout(saveTimer);
    if (app.doc) await store.saveDoc(metaOf()).catch(err => console.warn('autosave', err));
    const named = (await store.listDocs().catch(() => [])).filter(d => d.name === name);
    let replaces = null;
    if (named.length) {
      pdf = await loadPdfjs(bytes, probe);
      const fp = (pdf.fingerprints || [])[0] || null;
      const mine = named.filter(d => (d.fp ? d.fp === fp : d.srcSize === bytes.length));
      const twin = mine.find(d => d.srcSize === bytes.length);
      const old = twin || mine[0];
      let keep = !!twin;
      if (old && !twin) {
        if (old.dirty ?? (old.markups || []).length > 0) {
          app.ui.busy(null);
          const pick = await app.ui.choose('This drawing is already on this device',
            'The copy here has changes that were never saved or exported. Opening the file keeps that copy as well, under the same name.',
            ['Open the file', 'Carry on with my copy']);
          if (pick !== 0 && pick !== 1) { closePdf(pdf); return; }
          keep = pick === 1;
          app.ui.busy('Opening…');
        } else if (modified && old.changedAt && modified < old.changedAt) keep = true;
        else replaces = old;
      }
      if (keep) {
        closePdf(pdf);
        await openStoredNow(old.id, handle);
        if (!twin) app.ui.toast('Carried on with the copy on this device');
        return;
      }
    }
    if (!pdf) pdf = await loadPdfjs(bytes, probe);
    const imp = await importPdf(PDFLib, bytes, probe.password);
    for (const a of imp.assets || []) await assets.put(a);
    const changed = imp.baseBytes !== bytes;
    const meta = {
      id: newId(), name, pageIndex: 0, markups: imp.markups, writable: imp.writable, password: probe.password, srcSize: bytes.length,
      dirty: false, handle, fp: (pdf.fingerprints || [])[0] || null, changedAt: modified || Date.now(),
    };
    // Measurements carry the scale they were made at: pick the drawing scale back up from them.
    const scaled = imp.markups.filter(m => MEASURE_TYPES.has(m.type) && m.mpp);
    if (scaled.length) meta.scale = { def: scaled[0].mpp, pages: Object.fromEntries(scaled.map(m => [m.page, m.mpp])) };
    await store.saveFile(meta.id, imp.baseBytes.buffer.slice(imp.baseBytes.byteOffset, imp.baseBytes.byteOffset + imp.baseBytes.byteLength)).catch(err => console.warn('could not keep a copy', err));
    if (changed) { closePdf(pdf); await showDoc(meta, imp.baseBytes); }
    else await showDoc(meta, imp.baseBytes, pdf);
    saveNow();
    if (replaces) { await store.removeDoc(replaces.id).catch(() => {}); assets.sweep(); }
    if (!imp.writable) app.ui.alert('View only', 'Redline can show this PDF but cannot write markups into it. Re-save it from Revu, or print it to a new PDF, to mark it up.');
    else if (imp.secured) app.ui.alert('This PDF is locked by its author', 'Whoever made it set it to block changes. Redline can still add your markups, but the copy you export will not carry that lock. Only go ahead if you are allowed to mark up this drawing.');
    else if (replaces) app.ui.toast('Opened the newer copy of this drawing');
    else if (imp.markups.length) app.ui.toast(`${imp.markups.length} Redline markups are editable again`);
  } catch (e) {
    console.error(e);
    app.ui.alert('That file would not open', e && e.name === 'PasswordException' ? 'A password is needed to open it.' : 'It may not be a PDF, or it may be damaged.');
  } finally { app.ui.busy(null); }
});

async function openStoredNow(id, handle = null) {
  app.ui.busy('Opening…');
  try {
    const [meta, buf] = await Promise.all([store.getDoc(id), store.loadFile(id)]);
    if (!meta || !buf) throw new Error('missing');
    if (handle) meta.handle = handle;
    await showDoc(meta, new Uint8Array(buf));
    if (handle) saveNow();
  } catch (e) {
    console.error(e);
    app.ui.alert('That file would not open', 'It is no longer stored on this device.');
    app.ui.showHome(true);
  } finally { app.ui.busy(null); }
}
app.openStored = id => inTurn(() => openStoredNow(id));

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
  touched();
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
  app.tools.resetCount();
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
    assets, form: app.doc.form, photoPages, title: app.doc.name.replace(/\.pdf$/i, ''), docId: app.doc.fp,
  });
};
app.exportName = (suffix = 'markup', ext = 'pdf') => {
  const base = app.doc.name.replace(/\.pdf$/i, '').replace(/ \((markup|flattened|report|text|pages)\)$/i, '');
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
  initFiles(app);
  initKeys(app);
  initBackup(app);
  initCompare(app);
  app.ui.refresh();

  $('file').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) await app.openBytes(f.name, new Uint8Array(await f.arrayBuffer()), { modified: f.lastModified });
  });
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', async e => {
    e.preventDefault();
    const files = [...(e.dataTransfer?.files || [])];
    const kit = files.find(x => /\.(redlinekit|json)$/i.test(x.name));
    if (kit) return app.kit.importFile(kit);
    const i = files.findIndex(x => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name));
    if (i < 0) return;
    // On a PC the dropped file can be written back to: ask for it before the event is over.
    const item = [...(e.dataTransfer.items || [])].filter(x => x.kind === 'file')[i];
    const asked = item && item.getAsFileSystemHandle ? item.getAsFileSystemHandle().catch(() => null) : null;
    const bytes = new Uint8Array(await files[i].arrayBuffer());
    const handle = asked ? await asked : null;
    await app.openBytes(files[i].name, bytes, { handle: handle && handle.kind === 'file' ? handle : null, modified: files[i].lastModified });
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
