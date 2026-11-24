// Touch, Pencil and mouse handling: what a drag or a tap does in each tool.
import { layoutText, translate, dragHandle, TEXT_TYPES } from './shapes.js';
import { normRect, simplify, clamp } from './geometry.js';
import { MAX_SCALE } from './viewer.js';

const clone = o => JSON.parse(JSON.stringify(o));
const KEEP_DRAWING = new Set(['pen', 'hl']);          // these never drop back to Select

export const newId = () => Array.from({ length: 16 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');

export function initTools(app) {
  const stage = app.el.stage;
  const pointers = new Map();       // pointerId → { x, y, type }
  let g = null;                     // the gesture in progress
  let pendingNote = null;           // id of a cloud waiting for its note position
  let penDown = false, lastPen = 0;

  const view = () => app.viewer.view;
  const pagePt = e => app.viewer.toPage(e.clientX, e.clientY);
  const onPage = p => {
    const s = app.viewer.size;
    return { x: clamp(p.x, 0, s.w), y: clamp(p.y, 0, s.h) };
  };
  const touches = () => [...pointers.values()].filter(p => p.type === 'touch');

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
      g = { kind: 'handle', id: h.dataset.handle, m: m0, orig: clone(m0), moved: false, sx: e.clientX, sy: e.clientY };
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
    const v = view();
    g = { kind: 'pan', sx: e.clientX, sy: e.clientY, tx: v.tx, ty: v.ty, moved: false, deselect: !panOnly };
  }

  function startDraw(e, tool) {
    const p = onPage(pagePt(e));
    const base = { id: newId(), page: app.doc.pageIndex, type: tool, ...app.newStyle(tool) };
    let m;
    if (tool === 'arrow') m = { ...base, p1: p, p2: { ...p } };
    else if (tool === 'callout') m = { ...base, tip: p, box: { ax: p.x, ay: p.y, align: 'l', w: null }, text: '' };
    else if (tool === 'text') m = { ...base, box: { ax: p.x, ay: p.y, align: 'l', w: null }, text: '' };
    else if (tool === 'pen' || tool === 'hl') m = { ...base, pts: [[p.x, p.y]] };
    else m = { ...base, rect: { x: p.x, y: p.y, w: 0, h: 0 } };          // cloud, cloudplus, rect, ellipse
    app.select(null);
    g = { kind: 'draw', tool, m, start: p, sx: e.clientX, sy: e.clientY };
    if (m.pts) app.renderDraft(m);
  }

  function updateDraw(e) {
    const m = g.m, p = onPage(pagePt(e));
    if (m.pts) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      for (const ev of evs.length ? evs : [e]) {
        const q = onPage(pagePt(ev)), last = m.pts[m.pts.length - 1];
        if (Math.hypot(q.x - last[0], q.y - last[1]) * view().scale >= 0.7) m.pts.push([q.x, q.y]);
      }
    } else if (m.type === 'arrow') {
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
    app.renderDraft(m);
  }

  function finishDraw(e) {
    const m = g.m, tool = g.tool, s = view().scale;
    const dragPx = Math.hypot(e.clientX - g.sx, e.clientY - g.sy);
    app.clearDraft();
    if (m.rect && (m.rect.w * s < 10 || m.rect.h * s < 10)) return app.ui.toast('Drag a box to draw');
    if (tool === 'arrow' && dragPx < 10) return app.ui.toast('Drag to draw');
    if (tool === 'callout' && dragPx < 14) {
      // Just a tap: put the note up and to the right of the point.
      m.box = { ax: m.tip.x + 45 * m.k, ay: m.tip.y - 40 * m.k, align: 'l', w: null };
    }
    if (m.pts) {
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

  /** A cloud + text whose note was never placed becomes a plain cloud. */
  function cancelPending() {
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
    else startDraw(e, app.tool);
  }

  function move(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (e.pointerType === 'pen') lastPen = performance.now();
    if (!g) return;
    const dxs = e.clientX - g.sx, dys = e.clientY - g.sy;
    switch (g.kind) {
      case 'pinch': updatePinch(); break;
      case 'pan':
        if (!g.moved && Math.hypot(dxs, dys) < 4) return;
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
        dragHandle(g.m, g.id, onPage(pagePt(e)), tb);
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
        if (!done.moved && done.deselect) app.select(null);
        app.viewer.settle();
        break;
      case 'move':
        if (done.moved) app.changed();
        else if (done.wasSel && TEXT_TYPES.has(done.m.type) && done.role === 'box') app.startEdit(done.m);
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

  app.tools = { cancelPending, abort: abortGesture, get pending() { return pendingNote; } };
}
