// Turns one markup into a short list of paths, text lines and pictures.
// The screen (SVG) and the saved PDF are both drawn from this same list.
import * as G from './geometry.js';
import { LINE_HEIGHT, ASCENT } from './text.js';

export const TEXT_TYPES = new Set(['cloudplus', 'callout', 'text']);
export const RECT_TYPES = new Set(['cloud', 'cloudplus', 'rect', 'ellipse']);
export const HEAD_TYPES = new Set(['cloudplus', 'callout', 'arrow', 'polyline']);
export const FILL_TYPES = new Set(['cloud', 'cloudplus', 'callout', 'text', 'rect', 'ellipse', 'area', 'polygon']);
export const SHAPE_FILL_TYPES = new Set(['cloud', 'cloudplus', 'rect', 'ellipse', 'area', 'polygon']);   // these fills can be see-through
export const MEASURE_TYPES = new Set(['dim', 'path', 'area']);
export const POLY_TYPES = new Set(['path', 'area', 'polyline', 'polygon']);          // drawn by tapping points

// Line types. These are Revu's six dashed styles, pattern for pattern (its "Dashed 1" to "Dashed 6", in that order):
// Revu only knows a line as dashed when the pattern in the file is exactly one of its own, and it draws dashes with
// square ends. On screen and in the exported picture the pattern grows with the sheet and with a thick line.
export const DASH_TYPES = new Set(['arrow', 'polyline', 'polygon', 'rect', 'ellipse', 'path', 'area']);
export const DASHES = {
  solid: { label: 'Solid', pattern: null },
  dot: { label: 'Dotted', pattern: [2, 2] },
  short: { label: 'Short dash', pattern: [3, 3] },
  dash: { label: 'Dashed', pattern: [4, 4] },
  dashdot: { label: 'Dash dot', pattern: [4, 3, 2, 3] },
  centre: { label: 'Centre line', pattern: [4, 3, 16, 3] },
  long: { label: 'Long short', pattern: [8, 4, 4, 4] },
};
/** The pattern as Revu knows it, or null for a solid line. */
export const dashPattern = m => (DASHES[m.dash] && DASHES[m.dash].pattern) || null;
/** The pattern as it is drawn for this markup. */
export const dashOf = m => { const p = dashPattern(m), u = Math.max(m.k || 1, m.width / 2); return p ? p.map(v => v * u) : null; };
/** What a dashed line adds to the way its stroke is drawn. */
const dashed = m => { const dash = dashOf(m); return dash ? { dash, cap: 'butt' } : {}; };

export const SUBJECT = {
  cloud: 'Cloud', cloudplus: 'Cloud+', callout: 'Callout', text: 'Text Box', arrow: 'Arrow',
  pen: 'Pen', hl: 'Highlight', rect: 'Rectangle', ellipse: 'Ellipse',
  stamp: 'Symbol', pin: 'Pin', dim: 'Length', path: 'Cable run', area: 'Area', sig: 'Signature', count: 'Count',
  polyline: 'Polyline', polygon: 'Polygon',
};

// A pin is open until it is dealt with. Fixed and not-accepted pins take their own colour, so a glance at the sheet shows what is left.
export const PIN_STATUS = {
  open: { label: 'Open', color: null },
  fixed: { label: 'Fixed', color: '#16a34a' },
  rejected: { label: 'Not accepted', color: '#d97706' },
};
export const statusOf = m => (PIN_STATUS[m.status] ? m.status : 'open');
export const pinColour = m => PIN_STATUS[statusOf(m)].color || m.color;
/** A pin's photos. Older drawings kept a single one under `photo`. */
export const photosOf = m => (Array.isArray(m.photos) ? m.photos : m.photo ? [m.photo] : []);

export const textPad = m => Math.max(3, m.fontSize * 0.25);
const fillAlpha = m => m.opacity * (m.fillOpacity ?? 1);
const isWhite = c => /^#f{3}(f{3})?$/i.test(c || '');

// ---- measurements ---------------------------------------------------------

export function fmtLength(metres) {
  if (!Number.isFinite(metres)) return '? m';
  if (metres < 1) return `${Math.round(metres * 1000)} mm`;
  return `${metres.toFixed(metres < 100 ? 2 : 1)} m`;
}
export function fmtArea(m2) {
  if (!Number.isFinite(m2)) return '? m²';
  return `${m2.toFixed(m2 < 100 ? 2 : 1)} m²`;
}

/** What a measuring markup measures, in metres and square metres. `mpp` = metres per page point. */
export function measureOf(m) {
  const mpp = m.mpp || NaN;
  if (m.type === 'dim') { const length = Math.hypot(m.p2.x - m.p1.x, m.p2.y - m.p1.y) * mpp; return { length, label: fmtLength(length) }; }
  if (m.type === 'path') { const length = G.polyLength(m.pts, false) * mpp; return { length, label: fmtLength(length) }; }
  if (m.type === 'area') {
    const area = G.polyArea(m.pts) * mpp * mpp, length = G.polyLength(m.pts, true) * mpp;
    return { area, length, label: fmtArea(area) };
  }
  return null;
}

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
function leaderItems(m, pts, head, dash = null) {
  const end = G.lineEnding(head, pts[0], pts[1], m.width, m.k);
  const d = [['M', end.shaftEnd.x, end.shaftEnd.y], ...pts.slice(1).map(p => ['L', p.x, p.y])];
  const items = [path(d, { stroke: m.color, w: m.width, opacity: m.opacity, ...(dash ? { dash, cap: 'butt' } : {}) })];
  for (const p of end.paths) {
    items.push(p.filled
      ? path(p.d, { fill: m.color, opacity: m.opacity })
      : path(p.d, { stroke: m.color, w: m.width, opacity: m.opacity, join: 'miter' }));
  }
  return items;
}

export function bumpRadius(m) {
  const r = m.pts ? G.ptsBounds(m.pts) : m.rect;
  return G.clamp(Math.min(r.w, r.h) * 0.3, 3, 8.4 * m.k);
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

/** A measurement's text on a white patch, centred on (cx, cy). */
function labelItems(m, font, s, cx, cy) {
  const size = m.fontSize, w = font.width(s, size), pad = size * 0.22;
  const box = { x: cx - w / 2 - pad, y: cy - size * 0.6, w: w + 2 * pad, h: size * 1.2 };
  return {
    box,
    items: [
      path(G.rectPath(box), { fill: '#ffffff', opacity: 0.86 * m.opacity, role: 'label' }),
      { t: 'text', lines: [{ s, x: cx - w / 2, y: cy + size * 0.36 }], size, color: m.color, opacity: m.opacity },
    ],
  };
}

/** Centre for a label that sits beside the segment a→b without touching it. */
function besideSegment(a, b, w, size) {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
  if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }      // the side that is up the page
  const off = Math.abs(nx) * (w / 2 + size * 0.3) + Math.abs(ny) * size * 0.6 + size * 0.35;
  return { x: (a.x + b.x) / 2 + nx * off, y: (a.y + b.y) / 2 + ny * off };
}

function longestSegment(pts) {
  let best = 0, len = -1;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (l > len) { len = l; best = i; }
  }
  return [{ x: pts[best - 1][0], y: pts[best - 1][1] }, { x: pts[best][0], y: pts[best][1] }];
}

/** A symbol's drawing, moved, scaled and turned into place on the page. */
function stampItems(m, a, font) {
  const r = m.rect, c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  if (!a) {
    // The picture is not on this device: show where it goes.
    const cs = G.rotatedCorners(r, m.rot || 0);
    return [path([['M', cs[0].x, cs[0].y], ['L', cs[1].x, cs[1].y], ['L', cs[2].x, cs[2].y], ['L', cs[3].x, cs[3].y], ['Z'], ['M', cs[0].x, cs[0].y], ['L', cs[2].x, cs[2].y], ['M', cs[1].x, cs[1].y], ['L', cs[3].x, cs[3].y]],
      { stroke: m.tint || '#6b7280', w: 0.75 * (m.k || 1), opacity: m.opacity })];
  }
  if (a.kind !== 'vec') {
    return [{ t: 'image', asset: a.id, x: r.x, y: r.y, w: r.w, h: r.h, rot: m.rot || 0, opacity: m.opacity, tint: a.alpha ? m.tint || null : null }];
  }
  const sx = r.w / a.w, sy = r.h / a.h, ls = Math.sqrt(Math.abs(sx * sy));
  const ang = ((m.rot || 0) * Math.PI) / 180, cs = Math.cos(ang), sn = Math.sin(ang);
  const f = (x, y) => {
    const px = r.x + x * sx - c.x, py = r.y + y * sy - c.y;
    return [c.x + px * cs - py * sn, c.y + px * sn + py * cs];
  };
  const tint = col => (!col ? null : m.tint && !isWhite(col) ? m.tint : col);
  const items = [];
  for (const it of a.items) {
    if (it.t === 'text') {
      // Lettering turns with its symbol, as a tag does in CAD.
      const size = it.size * ls, w = font.width(it.s, size), x = r.x + it.x * sx, y = r.y + it.y * sy;
      items.push({ t: 'text', lines: [{ s: it.s, x: x - w / 2, y: y + size * 0.36 }], size, color: tint(it.color || '#000000'), opacity: m.opacity, rot: m.rot || 0, cx: c.x, cy: c.y });
    } else {
      items.push(path(G.mapPath(it.d, f), {
        stroke: tint(it.stroke), fill: tint(it.fill), w: Math.max(0.1, (it.w || 0.5) * ls),
        opacity: m.opacity, join: it.join || 'round', cap: it.cap || 'round', eo: !!it.eo,
        dash: it.dash ? it.dash.map(v => v * ls) : null,
      }));
    }
  }
  return items;
}

/**
 * Returns { parts, bbox, textBox, handles }.
 * A part becomes one PDF markup: { kind, items, bbox, ...geometry the exporter needs }.
 * Items may carry `role` ('box' = the text box) so the screen knows what was grabbed.
 * `assets.get(id)` gives the picture or drawing behind a symbol.
 */
export function buildShapes(m, font, assets) {
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
  const vertexHandles = pts => pts.forEach((p, i) => handles.push({ id: `v${i}`, x: p[0], y: p[1] }));
  const cloudPart = () => {
    const poly = m.pts ? m.pts.map(p => ({ x: p[0], y: p[1] })) : G.rectCorners(m.rect);
    const c = G.cloud(poly, bumpRadius(m));
    const items = [];
    if (m.fill) items.push(path(c.fill, { fill: m.fill, opacity: fillAlpha(m) }));
    items.push(path(c.stroke, { stroke: m.color, w: m.width, opacity: m.opacity }));
    parts.push({ kind: 'cloud', items, bbox: bounds(items), poly });
    if (m.pts) vertexHandles(m.pts); else rectHandles(m.rect);
    return c;
  };

  switch (m.type) {
    case 'cloud':
      cloudPart();
      break;
    case 'cloudplus': {
      const c = cloudPart();
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
      const items = leaderItems(m, [m.p2, m.p1], m.head, dashOf(m));
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
      parts.push({ kind: 'ink', items, bbox: bounds(items), strokes: [m.pts], highlight: hl });
      break;
    }
    case 'sig': {
      // A saved signature: strokes kept in a 0–1 box, stretched over the rectangle.
      const r = m.rect;
      const strokes = m.strokes.map(s => s.map(p => [r.x + p[0] * r.w, r.y + p[1] * r.h]));
      const items = strokes.map(s => path(G.inkPath(s), { stroke: m.color, w: m.width, opacity: m.opacity }));
      parts.push({ kind: 'ink', items, bbox: bounds(items, [r]), strokes, highlight: false, hit: G.rectPath(r) });
      rectHandles(r);
      break;
    }
    case 'rect':
    case 'ellipse': {
      const d = m.type === 'rect' ? G.rectPath(m.rect) : G.ellipsePath(m.rect);
      const items = [];
      if (m.fill) items.push(path(d, { fill: m.fill, opacity: fillAlpha(m) }));
      items.push(path(d, { stroke: m.color, w: m.width, opacity: m.opacity, join: 'miter', ...dashed(m) }));
      parts.push({ kind: m.type, items, bbox: bounds(items), rect: m.rect });
      rectHandles(m.rect);
      break;
    }
    case 'polyline': {
      // A line through any number of points. The arrowhead, if it has one, is at the last point.
      const tipFirst = m.pts.map(p => ({ x: p[0], y: p[1] })).reverse();
      const items = leaderItems(m, tipFirst, m.head || 'none', dashOf(m));
      parts.push({ kind: 'polyline', items, bbox: bounds(items), pts: m.pts, head: m.head || 'none' });
      vertexHandles(m.pts);
      break;
    }
    case 'polygon': {
      const d = G.polyPath(m.pts, true), items = [];
      if (m.fill) items.push(path(d, { fill: m.fill, opacity: fillAlpha(m) }));
      items.push(path(d, { stroke: m.color, w: m.width, opacity: m.opacity, ...dashed(m) }));
      parts.push({ kind: 'polygon', items, bbox: bounds(items), pts: m.pts });
      vertexHandles(m.pts);
      break;
    }
    case 'stamp': {
      const a = assets ? assets.get(m.sym) : null;
      const items = stampItems(m, a, font);
      const cs = G.rotatedCorners(m.rect, m.rot || 0);
      const box = G.ptsBounds(cs.map(p => [p.x, p.y]));
      const hit = [['M', cs[0].x, cs[0].y], ['L', cs[1].x, cs[1].y], ['L', cs[2].x, cs[2].y], ['L', cs[3].x, cs[3].y], ['Z']];
      parts.push({ kind: 'stamp', items, bbox: { x: box.x - 1, y: box.y - 1, w: box.w + 2, h: box.h + 2 }, hit });
      ['nw', 'ne', 'se', 'sw'].forEach((id, i) => handles.push({ id, x: cs[i].x, y: cs[i].y }));
      const c = { x: m.rect.x + m.rect.w / 2, y: m.rect.y + m.rect.h / 2 };
      const top = G.rotate({ x: c.x, y: m.rect.y - 16 * (m.k || 1) }, c, m.rot || 0);
      handles.push({ id: 'rot', x: top.x, y: top.y });
      break;
    }
    case 'pin': {
      const r = 9 * m.k * (m.size || 1), c = m.p, s = String(m.n);
      const size = r * (s.length > 2 ? 0.95 : 1.25), w = font.width(s, size);
      const col = pinColour(m), status = statusOf(m);
      const items = [
        path(G.circlePath(c.x, c.y, r), { fill: col, stroke: '#ffffff', w: r * 0.16, opacity: m.opacity }),
        { t: 'text', lines: [{ s, x: c.x - w / 2, y: c.y + size * 0.36 }], size, color: '#ffffff', opacity: m.opacity },
      ];
      if (photosOf(m).length) {
        // A small camera-lens mark: this pin has a photo.
        const bx = c.x + r * 0.78, by = c.y - r * 0.78, br = r * 0.44;
        items.push(path(G.circlePath(bx, by, br), { fill: '#ffffff', stroke: col, w: r * 0.13, opacity: m.opacity }));
        items.push(path(G.circlePath(bx, by, br * 0.42), { fill: col, opacity: m.opacity }));
      }
      if (status !== 'open') {
        // A tick for fixed, a cross for not accepted: readable in black and white too.
        const bx = c.x + r * 0.78, by = c.y + r * 0.78, br = r * 0.5, u = br * 0.5;
        items.push(path(G.circlePath(bx, by, br), { fill: '#ffffff', stroke: col, w: r * 0.13, opacity: m.opacity }));
        const mark = status === 'fixed'
          ? [['M', bx - u, by], ['L', bx - u * 0.25, by + u * 0.7], ['L', bx + u, by - u * 0.7]]
          : [['M', bx - u * 0.75, by - u * 0.75], ['L', bx + u * 0.75, by + u * 0.75], ['M', bx + u * 0.75, by - u * 0.75], ['L', bx - u * 0.75, by + u * 0.75]];
        items.push(path(mark, { stroke: col, w: r * 0.16, opacity: m.opacity }));
      }
      const hit = G.circlePath(c.x, c.y, r * 1.5);
      parts.push({ kind: 'pin', items, bbox: bounds(items), hit });
      break;
    }
    case 'count': {
      // A tick on everything counted, and the total beside the last one.
      const s = 5 * m.k * (m.size || 1), d = [];
      for (const [x, y] of m.pts) d.push(['M', x - s, y - s * 0.05], ['L', x - s * 0.3, y + s * 0.7], ['L', x + s, y - s * 0.8]);
      const items = [
        path(d, { stroke: '#ffffff', w: s * 0.8, opacity: m.opacity }),
        path(d, { stroke: m.color, w: s * 0.42, opacity: m.opacity }),
      ];
      const last = m.pts[m.pts.length - 1], text = `${m.label ? `${m.label}: ` : ''}${m.pts.length}`;
      const size = 1.9 * s, w = font.width(text, size), pad = size * 0.3;
      const pill = { x: last[0] + s * 1.5, y: last[1] - s * 0.8 - size * 0.62, w: w + 2 * pad, h: size * 1.24 };
      items.push(path(G.rectPath(pill), { fill: m.color, opacity: m.opacity }));
      items.push({ t: 'text', lines: [{ s: text, x: pill.x + pad, y: pill.y + size * 0.98 }], size, color: '#ffffff', opacity: m.opacity });
      parts.push({ kind: 'count', items, bbox: bounds(items, [pill]), total: text });
      break;
    }
    case 'dim': {
      const { p1, p2 } = m, len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      const nx = -(p2.y - p1.y) / len, ny = (p2.x - p1.x) / len, t = 4 * m.k + m.width;
      const d = [['M', p1.x, p1.y], ['L', p2.x, p2.y],
        ['M', p1.x + nx * t, p1.y + ny * t], ['L', p1.x - nx * t, p1.y - ny * t],
        ['M', p2.x + nx * t, p2.y + ny * t], ['L', p2.x - nx * t, p2.y - ny * t]];
      const text = measureOf(m).label;
      const at = besideSegment(p1, p2, font.width(text, m.fontSize), m.fontSize);
      const lab = labelItems(m, font, text, at.x, at.y);
      const items = [path(d, { stroke: m.color, w: m.width, opacity: m.opacity, cap: 'butt' }), ...lab.items];
      parts.push({ kind: 'line', items, bbox: bounds(items, [lab.box]), p1, p2, head: 'none', measure: text });
      handles.push({ id: 'p1', x: p1.x, y: p1.y }, { id: 'p2', x: p2.x, y: p2.y });
      break;
    }
    case 'path':
    case 'area': {
      const closed = m.type === 'area';
      const d = G.polyPath(m.pts, closed), text = measureOf(m).label;
      const items = [];
      if (closed) items.push(path(d, { fill: m.fill || m.color, opacity: m.opacity * (m.fillOpacity ?? 0.15) }));
      items.push(path(d, { stroke: m.color, w: m.width, opacity: m.opacity, ...dashed(m) }));
      let at;
      if (closed) at = G.polyCentre(m.pts);
      else { const [a, b] = longestSegment(m.pts); at = besideSegment(a, b, font.width(text, m.fontSize), m.fontSize); }
      const lab = labelItems(m, font, text, at.x, at.y);
      items.push(...lab.items);
      parts.push({ kind: closed ? 'polygon' : 'polyline', items, bbox: bounds(items, [lab.box]), pts: m.pts, measure: text });
      vertexHandles(m.pts);
      break;
    }
  }
  const bbox = parts.map(p => p.bbox).reduce(union);
  return { parts, bbox, textBox, handles, k: m.k || 1 };
}

/** Move a markup. `what` = 'box' moves only the text box of a callout / cloud+. */
export function translate(m, dx, dy, what) {
  const mv = p => { p.x += dx; p.y += dy; };
  if (what === 'box' && m.box && (m.type === 'callout' || m.type === 'cloudplus')) { m.box.ax += dx; m.box.ay += dy; return; }
  if (m.rect) mv(m.rect);
  if (m.box) { m.box.ax += dx; m.box.ay += dy; }
  if (m.tip) mv(m.tip);
  if (m.p) mv(m.p);
  if (m.p1) { mv(m.p1); mv(m.p2); }
  if (m.pts) for (const p of m.pts) { p[0] += dx; p[1] += dy; }
}

/** Drag one handle to a new position. */
export function dragHandle(m, id, p, tb) {
  if (id === 'tip') { m.tip = { x: p.x, y: p.y }; return; }
  if (id === 'p1' || id === 'p2') { m[id] = { x: p.x, y: p.y }; return; }
  if (id[0] === 'v' && m.pts) { m.pts[Number(id.slice(1))] = [p.x, p.y]; return; }
  if (id === 'bl' || id === 'br') {
    const min = m.fontSize * 2 + 2 * textPad(m);
    let left = tb.x, right = tb.x + tb.w;
    if (id === 'bl') left = Math.min(p.x, right - min); else right = Math.max(p.x, left + min);
    m.box.w = right - left;
    m.box.ax = m.box.align === 'r' ? right : m.box.align === 'c' ? (left + right) / 2 : left;
    return;
  }
  if (m.type === 'stamp') {
    const r = m.rect, c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    if (id === 'rot') {
      let deg = (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
      deg = Math.round(deg / 15) * 15;                       // click into 15° steps
      m.rot = ((deg % 360) + 360) % 360;
      return;
    }
    // A corner: grow or shrink about the centre, keeping the shape.
    const f = Math.max(0.05, Math.hypot(p.x - c.x, p.y - c.y) / (Math.hypot(r.w, r.h) / 2));
    const w = Math.max(3, r.w * f), h = Math.max(3, r.h * f);
    m.rect = { x: c.x - w / 2, y: c.y - h / 2, w, h };
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

/** Turn a markup with its page, a quarter turn clockwise at a time. (W, H) is the page size before the turn. */
export function rotateQuarter(m, W, H) {
  const f = p => ({ x: H - p.y, y: p.x });
  if (m.rect) { const a = f({ x: m.rect.x, y: m.rect.y + m.rect.h }); m.rect = { x: a.x, y: a.y, w: m.rect.h, h: m.rect.w }; }
  if (m.type === 'stamp') {
    // The picture keeps its own shape and turns with the page instead.
    const r = m.rect, c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
    m.rect = { x: c.x - r.h / 2, y: c.y - r.w / 2, w: r.h, h: r.w };
    m.rot = ((m.rot || 0) + 90) % 360;
  }
  if (m.type === 'sig') m.strokes = m.strokes.map(s => s.map(p => [1 - p[1], p[0]]));
  if (m.box) { const a = f({ x: m.box.ax, y: m.box.ay }); m.box.ax = a.x; m.box.ay = a.y; }
  for (const key of ['tip', 'p', 'p1', 'p2']) if (m[key]) m[key] = f(m[key]);
  if (m.pts) m.pts = m.pts.map(p => [H - p[1], p[0]]);
}
