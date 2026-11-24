// Touch, Pencil and mouse handling: what a drag or a tap does in each tool.
import { layoutText, translate, dragHandle, TEXT_TYPES } from './shapes.js';
import { normRect, simplify, clamp, polyArea } from './geometry.js';
import { MAX_SCALE } from './viewer.js';

const clone = o => JSON.parse(JSON.stringify(o));
const KEEP_DRAWING = new Set(['pen', 'hl', 'stamp']);      // these never drop back to Select
const MARQUEE = new Set(['snip', 'retype']);               // drag a box that is not itself a markup
const FOLLOW = new Set(['stamp', 'sig', 'pin']);           // the markup rides under the finger until it is let go

export const newId = () => Array.from({ length: 16 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export function initTools(app) {
  const stage = app.el.stage;
  const pointers = new Map();       // pointerId → { x, y, type }
  let g = null;                     // the gesture in progress
  let pendingNote = null;           // id of a cloud waiting for its note position
  let poly = null;                  // a shape being tapped out point by point: { m, tool, closed }
  let penDown = false, lastPen = 0;

  const view = () => app.viewer.view;
  const pagePt = e => app.viewer.toPage(e.clientX, e.clientY);
  const onPage = p => {
    const s = app.viewer.size;
    return { x: clamp(p.x, 0, s.w), y: clamp(p.y, 0, s.h) };
  };
  const touches = () => [...pointers.values()].filter(p => p.type === 'touch');
  /** Tools where each tap adds a corner. */
  const tapsPoints = t => t === 'path' || t === 'area' || (t === 'cloud' && app.prefs.tools.cloud.shape === 'poly');

  // ---- gestures -----------------------------------------------------------

  function abortGesture() {
    if (!g) return;
    if (g.kind === 'draw') app.clearDraft();
    if ((g.kind === 'move' || g.kind === 'handle') && g.moved) {
      Object.assign(g.m, clone(g.orig));
      app.dropUndo();
      app.renderOne(g.m);
      app.renderSelection();
    }
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
      const wasSel = app.sel === m.id;
      app.select(m.id);
      g = { kind: 'move', m, role: t.dataset.role || 'body', orig: clone(m), start: pagePt(e), sx: e.clientX, sy: e.clientY, moved: false, wasSel };
      return;
    }
    const field = !panOnly && t.closest && t.closest('[data-field]');
    const v = view();
    g = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, moved: false, deselect: !panOnly, field: field ? field.dataset.field : null };
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
      const base = { id: newId(), page, type: tool, ...app.newStyle(tool) };
      if (tool === 'arrow' || tool === 'dim') m = { ...base, p1: p, p2: { ...p } };
      else if (tool === 'callout') m = { ...base, tip: p, box: { ax: p.x, ay: p.y, align: 'l', w: null }, text: '' };
      else if (tool === 'text') m = { ...base, box: { ax: p.x, ay: p.y, align: 'l', w: null }, text: '' };
      else if (tool === 'pen' || tool === 'hl') m = { ...base, pts: [[p.x, p.y]] };
      else if (tool === 'cloud' && app.prefs.tools.cloud.shape === 'free') { m = { ...base, pts: [[p.x, p.y]] }; free = true; }
      else m = { ...base, rect: { x: p.x, y: p.y, w: 0, h: 0 } };          // cloud, cloudplus, rect, ellipse
    }
    app.select(null);
    g = { kind: 'draw', tool, m, start: p, sx: e.clientX, sy: e.clientY, free };
    if (m.pts || FOLLOW.has(tool)) app.renderDraft(free ? { ...m, type: 'pen' } : m);
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
      m.p = p;
    } else if (m.type === 'stamp' || m.type === 'sig') {
      m.rect = { ...m.rect, x: p.x - m.rect.w / 2, y: p.y - m.rect.h / 2 };
    } else if (m.type === 'arrow' || m.type === 'dim') {
      m.p2 = p;
    } else if (m.type === 'callout') {
      const dx = p.x - m.tip.x, dy = p.y - m.tip.y;
      m.box.ax = p.x; m.box.ay = p.y;
      m.box.align = Math.abs(dx) < Math.abs(dy) * 0.4 ? 'c' : dx < 0 ? 'r' : 'l';
    } else if (m.type === 'text') {
      m.box.ax = p.x; m.box.ay = p.y;
    } else {
      m.rect = normRect(g.start, p);
    }
    app.renderDraft(g.free ? { ...m, type: 'pen' } : m);
  }

  function finishDraw(e) {
    const m = g.m, tool = g.tool, s = view().scale;
    const dragPx = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
    app.clearDraft();

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
    if ((tool === 'arrow' || tool === 'dim') && dragPx < 10) return app.ui.toast('Drag to draw');
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
    const p = onPage(pagePt(e)), s = view().scale;
    if (!poly) {
      const tool = app.tool;
      poly = { tool, closed: tool !== 'path', m: { id: newId(), page: app.doc.pageIndex, type: tool, ...app.newStyle(tool), pts: [[p.x, p.y]] } };
      app.select(null);
      app.ui.polyBar(true);
      app.ui.hint(poly.closed ? 'Tap each corner, then Done' : 'Tap along the run, then Done');
    } else {
      const pts = poly.m.pts;
      const near = q => Math.hypot(q[0] - p.x, q[1] - p.y) * s < 16;
      if (poly.closed && pts.length >= 3 && near(pts[0])) return finishPoly();
      if (near(pts[pts.length - 1])) { if (pts.length >= (poly.closed ? 3 : 2)) finishPoly(); return; }
      pts.push([p.x, p.y]);
    }
    drawPoly();
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
    else if (tapsPoints(app.tool)) { const v = view(); g = { kind: 'polytap', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, moved: false }; }
    else startDraw(e, app.tool);
  }

  function move(e) {
    const p = pointers.get(e.pointerId);
    if (!p) {
      // A mouse hovering while a shape is being tapped out: show where the next line would go.
      if (poly && e.pointerType === 'mouse' && e.buttons === 0 && !e.target.closest('.stage-ui')) { const q = onPage(pagePt(e)); drawPoly([q.x, q.y]); }
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
        if (!g.moved && Math.hypot(dxs, dys) < (g.kind === 'pan' ? 4 : 8)) return;
        g.moved = true;
        app.viewer.setView({ tx: g.tx + dxs, ty: g.ty + dys });
        break;
      case 'move': {
        if (!g.moved && Math.hypot(dxs, dys) < 6) return;
        if (!g.moved) { g.moved = true; app.pushUndo(); }
        const q = pagePt(e);
        Object.assign(g.m, clone(g.orig));
        translate(g.m, q.x - g.start.x, q.y - g.start.y, g.role === 'box' ? 'box' : null);
        app.renderOne(g.m);
        app.renderSelection();
        break;
      }
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
      case 'move':
        if (done.moved) app.changed();
        else if (done.wasSel && TEXT_TYPES.has(done.m.type) && done.role === 'box') app.startEdit(done.m);
        else if (done.wasSel && done.m.type === 'pin') app.pins.open(done.m);
        break;
      case 'handle':
        if (done.moved) app.changed();
        break;
      case 'draw': g = done; finishDraw(e); g = null; break;
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
  stage.addEventListener('wheel', wheel, { passive: false });
  stage.addEventListener('contextmenu', e => e.preventDefault());
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) stage.addEventListener(t, e => e.preventDefault());

  app.tools = {
    cancelPending, abort: abortGesture, polyDone: finishPoly, polyUndo,
    get pending() { return pendingNote; }, get tapping() { return !!poly; },
  };
}
