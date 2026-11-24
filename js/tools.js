// Touch, Pencil and mouse handling: what a drag or a tap does in each tool.
import { layoutText, translate, dragHandle, TEXT_TYPES } from './shapes.js';
import { normRect, simplify, clamp, polyArea, polyLength, ptsBounds } from './geometry.js';
import { MAX_SCALE } from './viewer.js';

const clone = o => JSON.parse(JSON.stringify(o));
const KEEP_DRAWING = new Set(['pen', 'hl', 'stamp', 'count']);      // these never drop back to Select
const MARQUEE = new Set(['snip', 'retype']);               // drag a box that is not itself a markup
const FOLLOW = new Set(['stamp', 'sig', 'pin']);           // the markup rides under the finger until it is let go
const OPEN = new Set(['path', 'polyline']);                // tapped-out shapes that do not close
const BLUE = '#2563eb';

/** Is the point inside the loop? */
function inLoop(x, y, pts) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}
/** Is a box (all but its outer edge) inside? `test(x, y)` says whether a point is. Forgiving of a loosely drawn loop. */
function mostlyIn(b, test) {
  const ix = b.w * 0.15, iy = b.h * 0.15;
  return [[b.x + b.w / 2, b.y + b.h / 2], [b.x + ix, b.y + iy], [b.x + b.w - ix, b.y + iy], [b.x + b.w - ix, b.y + b.h - iy], [b.x + ix, b.y + b.h - iy]].every(([x, y]) => test(x, y));
}
/** Where the line a to b crosses a circle, as fractions of the way along, in order. */
function crossings(a, b, c, R) {
  const dx = b[0] - a[0], dy = b[1] - a[1], fx = a[0] - c.x, fy = a[1] - c.y;
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - R * R;
  if (A < 1e-12) return [];
  const disc = B * B - 4 * A * C;
  if (disc <= 1e-12) return [];
  const s = Math.sqrt(disc);
  return [(-B - s) / (2 * A), (-B + s) / (2 * A)].filter(t => t > 0 && t < 1);
}
/** Rub a circle out of a stroke. Gives the pieces that are left, or null if the circle missed it. */
export function eraseStroke(pts, c, R) {
  const out = [], inside = p => Math.hypot(p[0] - c.x, p[1] - c.y) < R;
  let cur = [], touched = false;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], ain = inside(a);
    if (ain) { touched = true; if (cur.length >= 2) out.push(cur); cur = []; } else cur.push(a);
    if (i === pts.length - 1) break;
    const b = pts[i + 1];
    let drawing = !ain;
    for (const t of crossings(a, b, c, R)) {
      const p = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      if (drawing) { cur.push(p); if (cur.length >= 2) out.push(cur); cur = []; touched = true; } else cur = [p];
      drawing = !drawing;
    }
  }
  if (cur.length >= 2) out.push(cur);
  return touched ? out : null;
}

export const newId = () => Array.from({ length: 16 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export function initTools(app) {
  const stage = app.el.stage;
  const pointers = new Map();       // pointerId → { x, y, type }
  let g = null;                     // the gesture in progress
  let pendingNote = null;           // id of a cloud waiting for its note position
  let poly = null;                  // a shape being tapped out point by point: { m, tool, closed }
  let counting = null;              // id of the count that taps are adding to
  let penDown = false, lastPen = 0;

  const view = () => app.viewer.view;
  const pagePt = e => app.viewer.toPage(e.clientX, e.clientY);
  const onPage = p => {
    const s = app.viewer.size;
    return { x: clamp(p.x, 0, s.w), y: clamp(p.y, 0, s.h) };
  };
  const touches = () => [...pointers.values()].filter(p => p.type === 'touch');
  /** Tools where each tap adds a corner. */
  const tapsPoints = t => t === 'path' || t === 'area' || t === 'polyline' || t === 'polygon' || (t === 'cloud' && app.prefs.tools.cloud.shape === 'poly');
  const coalesced = e => { const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; return evs.length ? evs : [e]; };
  const hereMarkups = () => app.markups.filter(m => m.page === app.doc.pageIndex);
  const r2 = n => Math.round(n * 100) / 100;

  // ---- straight and level -------------------------------------------------
  const snapOn = () => app.prefs.snap !== false;
  /** A line from a to b that is within a few degrees of level or upright is made exactly so. */
  function snapLine(a, b) {
    if (!snapOn()) return b;
    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), tol = Math.tan((4 * Math.PI) / 180);
    if (dx && dy <= dx * tol) return { x: b.x, y: a.y };
    if (dy && dx <= dy * tol) return { x: a.x, y: b.y };
    return b;
  }
  const centreOf = m => (m.type === 'pin' ? m.p : { x: m.rect.x + m.rect.w / 2, y: m.rect.y + m.rect.h / 2 });
  /** A symbol or pin that is nearly in line with another one clicks into line. Returns the point and the guide lines to show. */
  function alignTo(p, skipId) {
    const guides = [];
    if (!snapOn()) return { p, guides };
    const tol = 7 / view().scale;
    let bx = null, by = null;
    for (const o of app.markups) {
      if (o.page !== app.doc.pageIndex || o.id === skipId || (o.type !== 'stamp' && o.type !== 'pin')) continue;
      const c = centreOf(o), dx = Math.abs(c.x - p.x), dy = Math.abs(c.y - p.y);
      if (dx < tol && (!bx || dx < bx.d)) bx = { d: dx, c };
      if (dy < tol && (!by || dy < by.d)) by = { d: dy, c };
    }
    const q = { x: bx ? bx.c.x : p.x, y: by ? by.c.y : p.y };
    if (bx) guides.push([bx.c, q]);
    if (by) guides.push([by.c, q]);
    return { p: q, guides };
  }
  const guideMarkups = guides => guides.map(([a, b]) => ({ id: 'guide', type: 'arrow', k: 1, head: 'none', color: '#2563eb', width: 1 / view().scale, opacity: 0.9, p1: a, p2: b }));

  /** The symbols a row drag would place: `row` of them, evenly spaced from where the drag began to where it is now. */
  function rowOf(gest) {
    const { m, start, rowEnd, row } = gest, out = [];
    for (let i = 0; i < row; i++) {
      const t = i / (row - 1), cx = start.x + (rowEnd.x - start.x) * t, cy = start.y + (rowEnd.y - start.y) * t;
      out.push({ ...clone(m), id: `row${i}`, rect: { ...m.rect, x: cx - m.rect.w / 2, y: cy - m.rect.h / 2 } });
    }
    return out;
  }

  // ---- gestures -----------------------------------------------------------

  function abortGesture() {
    if (!g) return;
    if (g.kind === 'draw' || g.kind === 'move' || g.kind === 'lasso' || g.kind === 'box' || g.kind === 'erase') app.clearDraft();
    if ((g.kind === 'move' || g.kind === 'handle') && g.moved) {
      const list = g.list || [g.m], origs = g.origs || [g.orig];
      list.forEach((m, i) => { Object.assign(m, clone(origs[i])); app.renderOne(m); });
      app.dropUndo();
      app.renderSelection();
    }
    if (g.kind === 'erase' && g.hit) app.changed();
    g = null;
  }

  function startPinch() {
    const [a, b] = touches();
    const r = stage.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    const v = view();
    g = {
      kind: 'pinch', d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), scale0: v.scale,
      px: (mx - v.tx) / v.scale, py: (my - v.ty) / v.scale,
    };
  }

  function updatePinch() {
    const [a, b] = touches();
    if (!a || !b) return;
    const r = stage.getBoundingClientRect();
    const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
    const fit = app.viewer.fitScale;
    const scale = clamp(g.scale0 * Math.hypot(a.x - b.x, a.y - b.y) / g.d0, fit * 0.5, Math.max(MAX_SCALE, fit * 4));
    app.viewer.setView({ scale, tx: mx - g.px * scale, ty: my - g.py * scale });
  }

  function startSelect(e, panOnly) {
    const t = e.target;
    const h = !panOnly && t.closest && t.closest('[data-handle]');
    const m0 = app.selected();
    if (h && m0) {
      g = { kind: 'handle', id: h.dataset.handle, m: m0, orig: clone(m0), moved: false, sx: e.clientX, sy: e.clientY, start: pagePt(e) };
      return;
    }
    const hit = !panOnly && t.closest && t.closest('[data-id]');
    const m = hit && app.getMarkup(hit.dataset.id);
    if (m) {
      // With Shift or Ctrl held, a tap adds the markup to what is picked or takes it out.
      if (e.shiftKey || e.ctrlKey || e.metaKey) { app.toggleSelect(m.id); g = { kind: 'none' }; return; }
      const wasSel = app.sel === m.id;
      if (!app.picked().includes(m)) app.select(m.id);
      startMove(e, m, t.dataset.role || 'body', wasSel);
      return;
    }
    if (!panOnly && e.shiftKey && e.pointerType === 'mouse') {
      // Shift and drag on empty space: a box that picks what is inside it.
      g = { kind: 'box', start: onPage(pagePt(e)), rect: null, sx: e.clientX, sy: e.clientY };
      return;
    }
    const field = !panOnly && t.closest && t.closest('[data-field]');
    const v = view();
    g = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, moved: false, deselect: !panOnly, field: field ? field.dataset.field : null };
  }

  /** Start dragging everything that is picked. `m` is the one under the finger. */
  function startMove(e, m, role, wasSel) {
    const list = app.picked();
    g = { kind: 'move', m, list, origs: list.map(clone), role, start: pagePt(e), sx: e.clientX, sy: e.clientY, moved: false, wasSel };
  }

  // ---- lasso --------------------------------------------------------------
  const selectDraft = extra => ({ id: 'pick', k: 1, color: BLUE, width: 1.5 / view().scale, opacity: 1, fill: BLUE, fillOpacity: 0.1, dash: 'dash', ...extra });
  function startLasso(e) {
    const hit = e.target.closest && e.target.closest('[data-id]');
    const m = hit && app.getMarkup(hit.dataset.id);
    // A drag that starts on something already picked moves the lot. Anywhere else it draws a loop.
    if (m && app.picked().includes(m)) return startMove(e, m, 'body', false);
    const p = onPage(pagePt(e));
    g = { kind: 'lasso', pts: [[p.x, p.y]], hit: m ? m.id : null, sx: e.clientX, sy: e.clientY };
  }
  function finishLasso(done) {
    app.clearDraft();
    const b = ptsBounds(done.pts);
    if (Math.max(b.w, b.h) * view().scale < 10) {
      // A tap: add that markup to what is picked, or take it out. On empty space, start again.
      if (done.hit) app.toggleSelect(done.hit); else app.select(null);
      return;
    }
    const found = hereMarkups().filter(m => mostlyIn(app.shapesOf(m).bbox, (x, y) => inLoop(x, y, done.pts)));
    if (!found.length) return app.ui.toast('Nothing inside that loop');
    app.selectMany([...app.picked(), ...found].map(m => m.id));
  }

  // ---- eraser -------------------------------------------------------------
  const eraserRadius = () => (12 * (app.prefs.tools.eraser.size || 1)) / view().scale;
  function eraserDraft(p) {
    const r = eraserRadius();
    app.renderDraft({ id: 'eraser', type: 'ellipse', k: 1, color: '#111111', width: 1 / view().scale, opacity: 0.8, fill: '#ffffff', fillOpacity: 0.6, rect: { x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r } });
  }
  /** Rub out whatever pen and highlighter strokes the eraser passes over between its last position and this one. */
  function eraseTo(e) {
    const r = eraserRadius();
    for (const ev of coalesced(e)) {
      const to = pagePt(ev), from = g.last || to;
      const steps = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (r * 0.7)));
      for (let i = 1; i <= steps; i++) {
        const c = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
        for (const m of hereMarkups()) {
          if (m.type !== 'pen' && m.type !== 'hl') continue;
          const left = eraseStroke(m.pts, c, r + m.width / 2);
          if (!left) continue;
          if (!g.hit) { g.hit = true; app.pushUndo(); }
          // What is left of the stroke becomes strokes of its own. Crumbs smaller than the line is wide are dropped.
          const keep = left.filter(q => polyLength(q, false) > m.width * 0.6).map(q => ({ ...clone(m), id: newId(), pts: q.map(v => [r2(v[0]), r2(v[1])]) }));
          app.markups.splice(app.markups.indexOf(m), 1, ...keep);
          app.dropOne(m.id);
          for (const k of keep) app.renderOne(k);
        }
      }
      g.last = to;
    }
    eraserDraft(g.last);
  }

  function startDraw(e, tool) {
    const p = onPage(pagePt(e));
    const page = app.doc.pageIndex, k = app.doc.pageInfo.k;
    let m, free = false;
    if (tool === 'stamp') {
      m = app.kit.newStamp(p);
      if (!m) { g = { kind: 'none' }; app.kit.open(); return; }
    } else if (tool === 'sig') {
      m = app.kit.newSignature(p);
      if (!m) { g = { kind: 'none' }; app.kit.signaturePad(); return; }
    } else if (tool === 'pin') {
      const d = app.prefs.tools.pin;
      m = { id: newId(), page, type: 'pin', k, n: app.nextPin(), p, color: d.color, size: d.size ?? 1, opacity: d.opacity ?? 1, note: '', photo: null };
    } else if (MARQUEE.has(tool)) {
      m = { id: 'marquee', page, type: 'rect', k, color: '#2563eb', width: 1.5 / view().scale, opacity: 1, fill: '#2563eb', fillOpacity: 0.12, rect: { x: p.x, y: p.y, w: 0, h: 0 } };
    } else {
      const base = { id: newId(), page, type: tool === 'line' ? 'arrow' : tool, ...app.newStyle(tool) };
      if (tool === 'line') m = { ...base, head: 'none', p1: p, p2: { ...p } };        // a line is an arrow with no head
      else if (tool === 'arrow' || tool === 'dim') m = { ...base, p1: p, p2: { ...p } };
      else if (tool === 'callout') m = { ...base, tip: p, box: { ax: p.x, ay: p.y, align: 'l', w: null }, text: '' };
      else if (tool === 'text') m = { ...base, box: { ax: p.x, ay: p.y, align: 'l', w: null }, text: '' };
      else if (tool === 'pen' || tool === 'hl') m = { ...base, pts: [[p.x, p.y]] };
      else if (tool === 'cloud' && app.prefs.tools.cloud.shape === 'free') { m = { ...base, pts: [[p.x, p.y]] }; free = true; }
      else m = { ...base, rect: { x: p.x, y: p.y, w: 0, h: 0 } };          // cloud, cloudplus, rect, ellipse
    }
    app.select(null);
    g = { kind: 'draw', tool, m, start: p, sx: e.clientX, sy: e.clientY, free, row: tool === 'stamp' ? Math.max(1, app.prefs.tools.stamp.row || 1) : 1, rowEnd: null, guides: null };
    if (tool === 'stamp' || tool === 'pin') {
      // Even a plain tap clicks into line with the symbols already there.
      const al = alignTo(p, null);
      if (tool === 'pin') m.p = al.p; else m.rect = { ...m.rect, x: al.p.x - m.rect.w / 2, y: al.p.y - m.rect.h / 2 };
      g.guides = al.guides;
    }
    if (g.guides && g.guides.length) app.renderDrafts([m, ...guideMarkups(g.guides)]);
    else if (m.pts || FOLLOW.has(tool)) app.renderDraft(free ? { ...m, type: 'pen' } : m);
  }

  function updateDraw(e) {
    const m = g.m, p = onPage(pagePt(e));
    if (m.pts) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e]) {
        const q = onPage(pagePt(ev)), last = m.pts[m.pts.length - 1];
        if (Math.hypot(q.x - last[0], q.y - last[1]) * view().scale >= 0.7) m.pts.push([q.x, q.y]);
      }
    } else if (m.type === 'pin') {
      const al = alignTo(p, null);
      m.p = al.p; g.guides = al.guides;
    } else if (m.type === 'stamp' && g.row > 1 && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) >= 12) {
      // Dragging with Row on: the symbol repeats from where the drag began to here.
      g.rowEnd = snapLine(g.start, p);
      return app.renderDrafts(rowOf(g));
    } else if (m.type === 'stamp' || m.type === 'sig') {
      g.rowEnd = null;
      const al = m.type === 'stamp' ? alignTo(p, null) : { p, guides: [] };
      m.rect = { ...m.rect, x: al.p.x - m.rect.w / 2, y: al.p.y - m.rect.h / 2 };
      g.guides = al.guides;
    } else if (m.type === 'arrow' || m.type === 'dim') {
      m.p2 = snapLine(m.p1, p);
    } else if (m.type === 'callout') {
      const dx = p.x - m.tip.x, dy = p.y - m.tip.y;
      m.box.ax = p.x; m.box.ay = p.y;
      m.box.align = Math.abs(dx) < Math.abs(dy) * 0.4 ? 'c' : dx < 0 ? 'r' : 'l';
    } else if (m.type === 'text') {
      m.box.ax = p.x; m.box.ay = p.y;
    } else {
      m.rect = normRect(g.start, p);
    }
    if (g.guides && g.guides.length) app.renderDrafts([m, ...guideMarkups(g.guides)]);
    else app.renderDraft(g.free ? { ...m, type: 'pen' } : m);
  }

  function finishDraw(e) {
    const m = g.m, tool = g.tool, s = view().scale;
    const dragPx = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
    app.clearDraft();

    if (tool === 'stamp' && g.rowEnd) {
      const list = rowOf(g).map(c => ({ ...c, id: newId() }));
      app.pushUndo();
      app.markups.push(...list);
      app.changed();
      return app.ui.toast(`${list.length} placed in a row`);
    }
    if (tool === 'snip') {
      if (m.rect.w * s < 12 || m.rect.h * s < 12) return app.ui.toast('Drag a box around what you want as a sticker');
      return app.kit.snip(m.rect);
    }
    if (tool === 'retype') {
      if (dragPx < 10) return app.retype.at(g.start);
      if (m.rect.w * s < 12 || m.rect.h * s < 8) return app.ui.toast('Tap text to retype it, or drag a box to cover something');
      return app.retype.cover(m.rect);
    }
    if (m.rect && !FOLLOW.has(tool) && (m.rect.w * s < 10 || m.rect.h * s < 10)) return app.ui.toast('Drag a box to draw');
    if ((tool === 'arrow' || tool === 'line' || tool === 'dim') && dragPx < 10) return app.ui.toast('Drag to draw');
    if (tool === 'callout' && dragPx < 14) {
      // Just a tap: put the note up and to the right of the point.
      m.box = { ax: m.tip.x + 45 * m.k, ay: m.tip.y - 40 * m.k, align: 'l', w: null };
    }
    if (g.free) {
      // A loop drawn by hand becomes a cloud that follows it.
      const pts = simplify(m.pts, Math.max(4 * m.k, 6 / s));
      if (pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 12 * m.k) pts.pop();
      if (pts.length < 3 || polyArea(pts) * s * s < 400) return app.ui.toast('Draw a loop around the area');
      m.pts = pts.map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]);
    } else if (m.pts) {
      if (m.pts.length < 2) m.pts.push([m.pts[0][0] + 0.1, m.pts[0][1]]);
      m.pts = simplify(m.pts, 0.6 / s).map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]);
    }
    app.pushUndo();
    app.markups.push(m);
    if (tool === 'cloudplus') {
      pendingNote = m.id;
      app.changed();
      app.ui.hint('Tap where the note goes');
      return;
    }
    if (!app.lock && !KEEP_DRAWING.has(tool)) app.setTool('select');
    app.changed();
    if (TEXT_TYPES.has(m.type)) { app.select(m.id); app.startEdit(m, true); }
    else if (m.type === 'pin') { if (app.tool === 'select') app.select(m.id); app.pins.open(m, true); }
    else if (app.tool === 'select') app.select(m.id);
  }

  function placeNote(e) {
    const m = app.getMarkup(pendingNote);
    pendingNote = null;
    app.ui.hint(null);
    if (!m) return;
    const p = onPage(pagePt(e)), r = m.rect;
    m.box = { ax: p.x, ay: p.y, align: p.x < r.x ? 'r' : p.x > r.x + r.w ? 'l' : 'c', w: null };
    m.text = '';
    if (!app.lock) app.setTool('select');
    app.changed();
    app.select(m.id);
    app.startEdit(m, true);
  }

  // ---- shapes tapped out point by point -----------------------------------

  /** What to show while the shape is still being tapped out. */
  function polyDraft(extra) {
    const m = poly.m, k = m.k, pts = extra ? [...m.pts, extra] : m.pts;
    if (pts.length === 1) {
      const r = 2.5 * k;
      return { id: 'd', type: 'ellipse', k, color: m.color, width: m.width, opacity: 1, fill: m.color, fillOpacity: 1, rect: { x: pts[0][0] - r, y: pts[0][1] - r, w: 2 * r, h: 2 * r } };
    }
    if (poly.tool === 'cloud') {
      if (pts.length >= 3) return { ...m, pts };
      return { id: 'd', type: 'arrow', k, color: m.color, width: m.width, opacity: 1, head: 'none', p1: { x: pts[0][0], y: pts[0][1] }, p2: { x: pts[1][0], y: pts[1][1] } };
    }
    if (poly.tool === 'area' && pts.length < 3) return { ...m, type: 'path', pts };
    if (poly.tool === 'polygon' && pts.length < 3) return { ...m, type: 'polyline', pts };
    return { ...m, pts };
  }
  const drawPoly = extra => { if (poly) app.renderDraft(polyDraft(extra)); };

  function endPoly() {
    poly = null;
    app.clearDraft();
    app.ui.polyBar(false);
    app.ui.hint(null);
  }

  function finishPoly() {
    if (!poly) return;
    const { m, closed } = poly;
    const enough = m.pts.length >= (closed ? 3 : 2);
    endPoly();
    if (!enough) return app.ui.toast(closed ? 'That needs at least three corners' : 'That needs at least two points');
    m.pts = m.pts.map(q => [Math.round(q[0] * 100) / 100, Math.round(q[1] * 100) / 100]);
    app.pushUndo();
    app.markups.push(m);
    if (!app.lock) app.setTool('select');
    app.changed();
    if (app.tool === 'select') app.select(m.id);
  }

  function addPolyPoint(e) {
    let p = onPage(pagePt(e));
    const s = view().scale;
    if (poly) { const l = poly.m.pts[poly.m.pts.length - 1]; p = snapLine({ x: l[0], y: l[1] }, p); }
    if (!poly) {
      const tool = app.tool;
      poly = { tool, closed: !OPEN.has(tool), m: { id: newId(), page: app.doc.pageIndex, type: tool, ...app.newStyle(tool), pts: [[p.x, p.y]] } };
      app.select(null);
      app.ui.polyBar(true);
      app.ui.hint(poly.closed ? 'Tap each corner, then Done' : tool === 'path' ? 'Tap along the run, then Done' : 'Tap each point, then Done');
    } else {
      const pts = poly.m.pts;
      const near = q => Math.hypot(q[0] - p.x, q[1] - p.y) * s < 16;
      if (poly.closed && pts.length >= 3 && near(pts[0])) return finishPoly();
      if (near(pts[pts.length - 1])) { if (pts.length >= (poly.closed ? 3 : 2)) finishPoly(); return; }
      pts.push([p.x, p.y]);
    }
    drawPoly();
  }

  /** The count tool: each tap leaves a tick, and the ticks of one go add up to one count. */
  function addCount(e) {
    const p = onPage(pagePt(e)), d = app.prefs.tools.count;
    let m = counting ? app.getMarkup(counting) : null;
    if (m && (m.type !== 'count' || m.page !== app.doc.pageIndex)) m = null;
    app.pushUndo();
    if (m) m.pts.push([r2(p.x), r2(p.y)]);
    else {
      m = { id: newId(), page: app.doc.pageIndex, type: 'count', k: app.doc.pageInfo.k, color: d.color, size: d.size ?? 1, opacity: 1, label: d.label || '', pts: [[r2(p.x), r2(p.y)]] };
      app.markups.push(m);
      counting = m.id;
    }
    app.changed();
  }

  function polyUndo() {
    if (!poly) return;
    poly.m.pts.pop();
    if (!poly.m.pts.length) endPoly(); else drawPoly();
  }

  /** Leave nothing half-made behind: an unplaced note, or a shape still being tapped out. */
  function cancelPending({ discard = false } = {}) {
    if (poly) { if (discard) endPoly(); else finishPoly(); }
    if (!pendingNote) return;
    const m = app.getMarkup(pendingNote);
    pendingNote = null;
    app.ui.hint(null);
    if (m && !m.box) { m.type = 'cloud'; app.changed(); }
  }

  // ---- pointer events -----------------------------------------------------

  function down(e) {
    if (!app.doc || e.target.closest('#editor, .stage-ui')) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    // Palm rejection: while the Pencil is down (or was a moment ago), ignore fingers.
    if (e.pointerType === 'touch' && (penDown || performance.now() - lastPen < 350)) return;
    e.preventDefault();
    try { stage.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }

    if (e.pointerType === 'pen') {
      penDown = true; lastPen = performance.now();
      if (!app.penSeen) { app.penSeen = true; if (!app.prefs.fingerDraws) app.ui.toast('Pencil draws. Fingers move the page.'); }
      // The Pencil wins over any finger or palm already on the glass.
      for (const [id, p] of pointers) if (p.type === 'touch') pointers.delete(id);
      abortGesture();
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });

    if (app.editing) { app.commitEdit(); g = { kind: 'none' }; return; }
    if (touches().length >= 2) { abortGesture(); startPinch(); return; }
    if (pointers.size > 1 || g) return;

    if (e.pointerType === 'mouse' && e.button === 1) { startSelect(e, true); return; }
    if (pendingNote) { g = { kind: 'note', sx: e.clientX, sy: e.clientY }; return; }
    const fingerPans = e.pointerType === 'touch' && app.penSeen && !app.prefs.fingerDraws;
    if (app.tool === 'select') startSelect(e, false);
    else if (fingerPans) startSelect(e, true);
    else if (app.tool === 'lasso') startLasso(e);
    else if (app.tool === 'eraser') { g = { kind: 'erase', sx: e.clientX, sy: e.clientY, hit: false, last: null }; eraseTo(e); }
    else if (app.tool === 'count' || tapsPoints(app.tool)) { const v = view(); g = { kind: app.tool === 'count' ? 'counttap' : 'polytap', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, moved: false }; }
    else startDraw(e, app.tool);
  }

  function move(e) {
    const p = pointers.get(e.pointerId);
    if (!p) {
      // A mouse hovering while a shape is being tapped out: show where the next line would go.
      if (poly && e.pointerType === 'mouse' && e.buttons === 0 && !e.target.closest('.stage-ui')) { const l = poly.m.pts[poly.m.pts.length - 1], q = snapLine({ x: l[0], y: l[1] }, onPage(pagePt(e))); drawPoly([q.x, q.y]); }
      // A mouse hovering with the eraser: show how big it is.
      else if (app.doc && app.tool === 'eraser' && !g && e.pointerType === 'mouse' && e.buttons === 0) eraserDraft(pagePt(e));
      return;
    }
    p.x = e.clientX; p.y = e.clientY;
    if (e.pointerType === 'pen') lastPen = performance.now();
    if (!g) return;
    const dxs = e.clientX - g.sx, dys = e.clientY - g.sy;
    switch (g.kind) {
      case 'pinch': updatePinch(); break;
      case 'pan':
      case 'polytap':
      case 'counttap':
        if (!g.moved && Math.hypot(dxs, dys) < (g.kind === 'pan' ? 4 : 8)) return;
        g.moved = true;
        app.viewer.setView({ tx: g.tx + dxs, ty: g.ty + dys });
        break;
      case 'move': {
        if (!g.moved && Math.hypot(dxs, dys) < 6) return;
        if (!g.moved) { g.moved = true; app.pushUndo(); }
        const q = pagePt(e), one = g.list.length === 1;
        g.list.forEach((m, i) => { Object.assign(m, clone(g.origs[i])); translate(m, q.x - g.start.x, q.y - g.start.y, one && g.role === 'box' ? 'box' : null); });
        if (one && (g.m.type === 'stamp' || g.m.type === 'pin')) {
          // Click into line with the other symbols on the page.
          const c = centreOf(g.m), al = alignTo(c, g.m.id);
          translate(g.m, al.p.x - c.x, al.p.y - c.y);
          if (al.guides.length) app.renderDrafts(guideMarkups(al.guides)); else app.clearDraft();
        }
        for (const m of g.list) app.renderOne(m);
        app.renderSelection();
        break;
      }
      case 'lasso': {
        for (const ev of coalesced(e)) {
          const q = onPage(pagePt(ev)), l = g.pts[g.pts.length - 1];
          if (Math.hypot(q.x - l[0], q.y - l[1]) * view().scale >= 3) g.pts.push([q.x, q.y]);
        }
        if (g.pts.length >= 3) app.renderDraft(selectDraft({ type: 'polygon', pts: g.pts }));
        break;
      }
      case 'box':
        g.rect = normRect(g.start, onPage(pagePt(e)));
        app.renderDraft(selectDraft({ type: 'rect', rect: g.rect }));
        break;
      case 'erase': eraseTo(e); break;
      case 'handle': {
        if (!g.moved && Math.hypot(dxs, dys) < 3) return;
        if (!g.moved) { g.moved = true; app.pushUndo(); }
        Object.assign(g.m, clone(g.orig));
        const tb = g.orig.box ? layoutText(g.orig, app.font) : null;
        if (g.orig.type === 'stamp' && g.id !== 'rot') {
          // Grow or shrink about the centre, by how far the finger has moved from where it took hold.
          const r = g.orig.rect, c = { x: r.x + r.w / 2, y: r.y + r.h / 2 }, q = pagePt(e);
          const f = Math.max(0.05, Math.hypot(q.x - c.x, q.y - c.y) / Math.max(1e-6, Math.hypot(g.start.x - c.x, g.start.y - c.y)));
          const w = Math.max(3, r.w * f), hh = Math.max(3, r.h * f);
          g.m.rect = { x: c.x - w / 2, y: c.y - hh / 2, w, h: hh };
        } else dragHandle(g.m, g.id, g.id === 'rot' ? pagePt(e) : onPage(pagePt(e)), tb);
        if ((g.id === 'p1' || g.id === 'p2') && (g.m.type === 'arrow' || g.m.type === 'dim')) g.m[g.id] = snapLine(g.id === 'p1' ? g.m.p2 : g.m.p1, g.m[g.id]);
        app.renderOne(g.m);
        app.renderSelection();
        break;
      }
      case 'draw': updateDraw(e); break;
    }
  }

  function up(e) {
    if (e.pointerType === 'pen') { penDown = false; lastPen = performance.now(); }
    if (!pointers.delete(e.pointerId)) return;
    try { stage.releasePointerCapture(e.pointerId); } catch { /* fine */ }
    if (!g) return;
    if (g.kind === 'pinch') {
      if (touches().length < 2) { g = pointers.size ? { kind: 'none' } : null; app.viewer.settle(); }
      return;
    }
    if (pointers.size) return;
    const done = g;
    g = null;
    switch (done.kind) {
      case 'pan':
        if (!done.moved && done.field) app.forms.tap(done.field);
        else if (!done.moved && done.deselect) app.select(null);
        app.viewer.settle();
        break;
      case 'polytap':
        if (done.moved) app.viewer.settle(); else addPolyPoint(e);
        break;
      case 'counttap':
        if (done.moved) app.viewer.settle(); else addCount(e);
        break;
      case 'move':
        app.clearDraft();
        if (done.moved) app.changed();
        else if (app.tool === 'lasso') app.toggleSelect(done.m.id);            // a tap with the lasso takes it out again
        else if (done.list.length > 1) app.select(done.m.id);                  // a tap on one of several picks just that one
        else if (done.wasSel && TEXT_TYPES.has(done.m.type) && done.role === 'box') app.startEdit(done.m);
        else if (done.wasSel && done.m.type === 'pin') app.pins.open(done.m);
        break;
      case 'handle':
        if (done.moved) app.changed();
        break;
      case 'draw': g = done; finishDraw(e); g = null; break;
      case 'lasso': finishLasso(done); break;
      case 'box': {
        app.clearDraft();
        const r = done.rect;
        if (!r || Math.max(r.w, r.h) * view().scale < 8) break;
        const found = hereMarkups().filter(m => mostlyIn(app.shapesOf(m).bbox, (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h));
        app.selectMany([...app.picked(), ...found].map(m => m.id));
        break;
      }
      case 'erase':
        app.clearDraft();
        if (done.hit) app.changed();
        break;
      case 'note':
        if (Math.hypot(e.clientX - done.sx, e.clientY - done.sy) < 12) placeNote(e);
        break;
    }
  }

  function cancel(e) {
    if (e.pointerType === 'pen') penDown = false;
    if (!pointers.delete(e.pointerId)) return;
    if (g && g.kind === 'pinch') { if (touches().length < 2) { g = pointers.size ? { kind: 'none' } : null; app.viewer.settle(); } return; }
    abortGesture();
    if (pointers.size) g = { kind: 'none' };
  }

  function wheel(e) {
    if (!app.doc || e.target.closest('.stage-ui')) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    if (e.shiftKey) { const v = view(); app.viewer.setView({ tx: v.tx - e.deltaY, ty: v.ty }, { settle: true }); return; }
    const step = e.ctrlKey ? 0.012 : 0.0022;       // pinch on a trackpad arrives as ctrl + wheel
    app.viewer.zoomAt(Math.exp(-e.deltaY * step), e.clientX - r.left, e.clientY - r.top);
  }

  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', cancel);
  stage.addEventListener('pointerleave', () => { if (!g && app.tool === 'eraser') app.clearDraft(); });
  stage.addEventListener('wheel', wheel, { passive: false });
  stage.addEventListener('contextmenu', e => e.preventDefault());
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) stage.addEventListener(t, e => e.preventDefault());

  app.tools = {
    cancelPending, abort: abortGesture, polyDone: finishPoly, polyUndo,
    resetCount: () => { counting = null; }, continueCount: id => { counting = id; },
    get counting() { const m = counting ? app.getMarkup(counting) : null; return m && m.type === 'count' ? m : null; },
    get pending() { return pendingNote; }, get tapping() { return !!poly; },
  };
}
