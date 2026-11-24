// Turns one markup into a short list of paths and text lines.
// The screen (SVG) and the saved PDF are both drawn from this same list.
import * as G from './geometry.js';
import { LINE_HEIGHT, ASCENT } from './text.js';

export const TEXT_TYPES = new Set(['cloudplus', 'callout', 'text']);
export const RECT_TYPES = new Set(['cloud', 'cloudplus', 'rect', 'ellipse']);
export const HEAD_TYPES = new Set(['cloudplus', 'callout', 'arrow']);
export const FILL_TYPES = new Set(['cloud', 'cloudplus', 'callout', 'text', 'rect', 'ellipse']);

export const SUBJECT = {
  cloud: 'Cloud', cloudplus: 'Cloud+', callout: 'Callout', text: 'Text Box', arrow: 'Arrow',
  pen: 'Pen', hl: 'Highlight', rect: 'Rectangle', ellipse: 'Ellipse',
};

export const SHAPE_FILL_TYPES = new Set(['cloud', 'cloudplus', 'rect', 'ellipse']);   // these fills can be see-through

export const textPad = m => Math.max(3, m.fontSize * 0.25);
const fillAlpha = m => m.opacity * (m.fillOpacity ?? 1);

/** Where the text box sits and how its text breaks. */
export function layoutText(m, font) {
  const size = m.fontSize, pad = textPad(m), lh = size * LINE_HEIGHT;
  const fixed = m.box.w != null;
  const maxInner = Math.max(size, fixed ? m.box.w - 2 * pad : size * 18);
  const strs = font.wrap(m.text || '', size, maxInner);
  const inner = fixed ? maxInner : Math.max(size * 1.5, ...strs.map(s => font.width(s, size)));
  const w = inner + 2 * pad, h = strs.length * lh + 2 * pad;
  const x = m.box.align === 'r' ? m.box.ax - w : m.box.align === 'c' ? m.box.ax - w / 2 : m.box.ax;
  const y = m.box.ay - pad - lh / 2;
  return {
    x, y, w, h, pad, size, lh,
    lines: strs.map((s, i) => ({ s, x: x + pad, y: y + pad + ASCENT * size + i * lh })),
  };
}

const path = (d, o) => ({ t: 'path', d, stroke: null, fill: null, w: 1, opacity: 1, join: 'round', cap: 'round', blend: null, ...o });

function textBoxItems(m, tb) {
  const items = [], d = G.rectPath(tb);
  if (m.fill) items.push(path(d, { fill: m.fill, opacity: m.opacity }));
  if (m.border) items.push(path(d, { stroke: m.color, w: m.width, opacity: m.opacity, join: 'miter' }));
  items.push({ t: 'text', lines: tb.lines, size: tb.size, color: m.textColor, opacity: m.opacity });
  return items;
}

/** pts = [tip, ...rest]; the ending is drawn at the tip. */
function leaderItems(m, pts, head) {
  const end = G.lineEnding(head, pts[0], pts[1], m.width, m.k);
  const d = [['M', end.shaftEnd.x, end.shaftEnd.y], ...pts.slice(1).map(p => ['L', p.x, p.y])];
  const items = [path(d, { stroke: m.color, w: m.width, opacity: m.opacity })];
  for (const p of end.paths) {
    items.push(p.filled
      ? path(p.d, { fill: m.color, opacity: m.opacity })
      : path(p.d, { stroke: m.color, w: m.width, opacity: m.opacity, join: 'miter' }));
  }
  return items;
}

export function bumpRadius(m) {
  return G.clamp(Math.min(m.rect.w, m.rect.h) * 0.3, 3, 8.4 * m.k);
}

function bounds(items, rects = []) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const it of items) {
    if (it.t !== 'path') continue;
    const pb = G.pathBounds(it.d);
    const e = (it.stroke ? it.w * (it.join === 'miter' ? 1.6 : 0.5) : 0) + 1;
    b.x0 = Math.min(b.x0, pb.x0 - e); b.y0 = Math.min(b.y0, pb.y0 - e);
    b.x1 = Math.max(b.x1, pb.x1 + e); b.y1 = Math.max(b.y1, pb.y1 + e);
  }
  for (const r of rects) {
    b.x0 = Math.min(b.x0, r.x); b.y0 = Math.min(b.y0, r.y);
    b.x1 = Math.max(b.x1, r.x + r.w); b.y1 = Math.max(b.y1, r.y + r.h);
  }
  return { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
}

const union = (a, b) => {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/**
 * Returns { parts, bbox, textBox, handles }.
 * A part becomes one PDF markup: { kind, items, bbox, ...geometry the exporter needs }.
 * Items may carry `role` ('box' = the text box) so the screen knows what was grabbed.
 */
export function buildShapes(m, font) {
  const parts = [];
  let textBox = null;
  const handles = [];
  const rectHandles = r => {
    const xs = [r.x, r.x + r.w / 2, r.x + r.w], ys = [r.y, r.y + r.h / 2, r.y + r.h];
    const ids = [['nw', 'n', 'ne'], ['w', null, 'e'], ['sw', 's', 'se']];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) if (ids[j][i]) handles.push({ id: ids[j][i], x: xs[i], y: ys[j] });
  };
  const boxHandles = tb => {
    handles.push({ id: 'bl', x: tb.x, y: tb.y + tb.h / 2 }, { id: 'br', x: tb.x + tb.w, y: tb.y + tb.h / 2 });
  };

  switch (m.type) {
    case 'cloud': {
      const c = G.cloud(G.rectCorners(m.rect), bumpRadius(m));
      const items = [];
      if (m.fill) items.push(path(c.fill, { fill: m.fill, opacity: fillAlpha(m) }));
      items.push(path(c.stroke, { stroke: m.color, w: m.width, opacity: m.opacity }));
      parts.push({ kind: 'cloud', items, bbox: bounds(items), rect: m.rect });
      rectHandles(m.rect);
      break;
    }
    case 'cloudplus': {
      const c = G.cloud(G.rectCorners(m.rect), bumpRadius(m));
      const cloudItems = [];
      if (m.fill) cloudItems.push(path(c.fill, { fill: m.fill, opacity: fillAlpha(m) }));
      cloudItems.push(path(c.stroke, { stroke: m.color, w: m.width, opacity: m.opacity }));
      parts.push({ kind: 'cloud', items: cloudItems, bbox: bounds(cloudItems), rect: m.rect });
      rectHandles(m.rect);
      if (m.box) {
        textBox = layoutText(m, font);
        const lead = G.cloudLeader(c.tips, textBox);
        const noteItems = textBoxItems({ ...m, fill: null }, textBox).map(it => ({ ...it, role: 'box' }));
        let leader = null;
        if (lead) {
          leader = [lead.tip, lead.anchor];
          noteItems.unshift(...leaderItems(m, leader, m.head));
        }
        parts.push({ kind: 'freetext', items: noteItems, bbox: bounds(noteItems, [textBox]), textBox, leader, head: m.head, callout: true });
        boxHandles(textBox);
      }
      break;
    }
    case 'callout': {
      textBox = layoutText(m, font);
      const lead = G.calloutLeader(m.tip, textBox, 22 * m.k);
      const items = textBoxItems(m, textBox).map(it => ({ ...it, role: 'box' }));
      let leader = null;
      if (lead) {
        leader = [lead.tip, lead.knee, lead.anchor];
        items.unshift(...leaderItems(m, leader, m.head));
      }
      parts.push({ kind: 'freetext', items, bbox: bounds(items, [textBox]), textBox, leader, head: m.head, callout: true });
      handles.push({ id: 'tip', x: m.tip.x, y: m.tip.y });
      boxHandles(textBox);
      break;
    }
    case 'text': {
      textBox = layoutText(m, font);
      const items = textBoxItems(m, textBox).map(it => ({ ...it, role: 'box' }));
      parts.push({ kind: 'freetext', items, bbox: bounds(items, [textBox]), textBox, leader: null, head: 'none', callout: false });
      boxHandles(textBox);
      break;
    }
    case 'arrow': {
      const items = leaderItems(m, [m.p2, m.p1], m.head);
      parts.push({ kind: 'line', items, bbox: bounds(items), p1: m.p1, p2: m.p2, head: m.head });
      handles.push({ id: 'p1', x: m.p1.x, y: m.p1.y }, { id: 'p2', x: m.p2.x, y: m.p2.y });
      break;
    }
    case 'pen':
    case 'hl': {
      const hl = m.type === 'hl';
      const items = [path(G.inkPath(m.pts), {
        stroke: m.color, w: m.width, opacity: m.opacity, blend: hl ? 'multiply' : null, cap: hl ? 'butt' : 'round',
      })];
      parts.push({ kind: 'ink', items, bbox: bounds(items), pts: m.pts, highlight: hl });
      break;
    }
    case 'rect':
    case 'ellipse': {
      const d = m.type === 'rect' ? G.rectPath(m.rect) : G.ellipsePath(m.rect);
      const items = [];
      if (m.fill) items.push(path(d, { fill: m.fill, opacity: fillAlpha(m) }));
      items.push(path(d, { stroke: m.color, w: m.width, opacity: m.opacity, join: 'miter' }));
      parts.push({ kind: m.type, items, bbox: bounds(items), rect: m.rect });
      rectHandles(m.rect);
      break;
    }
  }
  const bbox = parts.map(p => p.bbox).reduce(union);
  return { parts, bbox, textBox, handles };
}

/** Move a markup. `what` = 'box' moves only the text box of a callout / cloud+. */
export function translate(m, dx, dy, what) {
  const mv = p => { p.x += dx; p.y += dy; };
  if (what === 'box' && m.box && (m.type === 'callout' || m.type === 'cloudplus')) { m.box.ax += dx; m.box.ay += dy; return; }
  if (m.rect) mv(m.rect);
  if (m.box) { m.box.ax += dx; m.box.ay += dy; }
  if (m.tip) mv(m.tip);
  if (m.p1) { mv(m.p1); mv(m.p2); }
  if (m.pts) for (const p of m.pts) { p[0] += dx; p[1] += dy; }
}

/** Drag one handle to a new position. */
export function dragHandle(m, id, p, tb) {
  if (id === 'tip') { m.tip = { x: p.x, y: p.y }; return; }
  if (id === 'p1' || id === 'p2') { m[id] = { x: p.x, y: p.y }; return; }
  if (id === 'bl' || id === 'br') {
    const min = m.fontSize * 2 + 2 * textPad(m);
    let left = tb.x, right = tb.x + tb.w;
    if (id === 'bl') left = Math.min(p.x, right - min); else right = Math.max(p.x, left + min);
    m.box.w = right - left;
    m.box.ax = m.box.align === 'r' ? right : m.box.align === 'c' ? (left + right) / 2 : left;
    return;
  }
  if (m.rect) {
    let x0 = m.rect.x, y0 = m.rect.y, x1 = m.rect.x + m.rect.w, y1 = m.rect.y + m.rect.h;
    if (id.includes('w')) x0 = p.x;
    if (id.includes('e')) x1 = p.x;
    if (id.includes('n')) y0 = p.y;
    if (id.includes('s')) y1 = p.y;
    m.rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(2, Math.abs(x1 - x0)), h: Math.max(2, Math.abs(y1 - y0)) };
  }
}
