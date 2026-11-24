// Pure geometry. All coordinates are page view space: points, origin top-left, y down.
// Paths are arrays of commands: ['M',x,y] ['L',x,y] ['C',x1,y1,x2,y2,x,y] ['Z'].

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Sheet-size factor: keeps bumps, arrowheads and auto text readable on big sheets. */
export function sheetFactor(pageW, pageH) {
  const long = Math.max(pageW, pageH);
  if (long <= 1300) return 1;      // A4, A3
  if (long <= 1800) return 1.5;    // A2
  if (long <= 2600) return 2;      // A1
  return 3;                        // A0 and up
}

export function normRect(a, b) {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

/** Cubic segments for a circular arc from angle a0 to a1 (radians, either direction). */
export function arcSegments(cx, cy, r, a0, a1) {
  const out = [];
  const total = a1 - a0;
  const n = Math.max(1, Math.ceil(Math.abs(total) / (Math.PI / 2) - 1e-9));
  const step = total / n;
  const t = (4 / 3) * Math.tan(step / 4);
  for (let i = 0; i < n; i++) {
    const s = a0 + i * step, e = s + step;
    const cs = Math.cos(s), ss = Math.sin(s), ce = Math.cos(e), se = Math.sin(e);
    out.push(['C',
      cx + r * (cs - t * ss), cy + r * (ss + t * cs),
      cx + r * (ce + t * se), cy + r * (se - t * ce),
      cx + r * ce, cy + r * se]);
  }
  return out;
}

export function rectPath(r) {
  return [['M', r.x, r.y], ['L', r.x + r.w, r.y], ['L', r.x + r.w, r.y + r.h], ['L', r.x, r.y + r.h], ['Z']];
}

export function ellipsePath(r) {
  const k = 0.5522847498, rx = r.w / 2, ry = r.h / 2, cx = r.x + rx, cy = r.y + ry;
  return [
    ['M', cx + rx, cy],
    ['C', cx + rx, cy + k * ry, cx + k * rx, cy + ry, cx, cy + ry],
    ['C', cx - k * rx, cy + ry, cx - rx, cy + k * ry, cx - rx, cy],
    ['C', cx - rx, cy - k * ry, cx - k * rx, cy - ry, cx, cy - ry],
    ['C', cx + k * rx, cy - ry, cx + rx, cy - k * ry, cx + rx, cy],
    ['Z'],
  ];
}

export function rectCorners(r) {
  return [{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }];
}

/**
 * Revision cloud around a closed polygon (convex corners; built for rectangles).
 * Bumps are circles of radius `r` centred on the outline; each is drawn between its
 * crossings with its neighbours, plus a short tail for the hand-drawn look.
 * Returns { stroke, fill, tips } where tips are the outermost point of each bump.
 */
export function cloud(points, r) {
  let pts = points.map(p => ({ x: p.x, y: p.y }));
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area2 += a.x * b.y - b.x * a.y;
  }
  if (area2 < 0) pts.reverse();            // make it clockwise on screen

  const spacing = r / 0.6;
  const centres = [];                       // { x, y, nx, ny } n = outward normal of the edge leaving this centre
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    let n = Math.max(1, Math.round(len / spacing));
    if (len / n > 1.8 * r) n++;
    const s = len / n;
    for (let k = 0; k < n; k++) centres.push({ x: a.x + ux * k * s, y: a.y + uy * k * s, nx: uy, ny: -ux });
  }
  const N = centres.length;
  if (N < 2) return { stroke: [], fill: [], tips: [] };

  // crossing between bump j and bump j+1, on the outside
  const cross = centres.map((c, j) => {
    const d = centres[(j + 1) % N];
    const half = Math.hypot(d.x - c.x, d.y - c.y) / 2;
    const h = Math.sqrt(Math.max(0, r * r - half * half));
    return { x: (c.x + d.x) / 2 + c.nx * h, y: (c.y + d.y) / 2 + c.ny * h };
  });

  const tail = 0.32;
  const stroke = [], fill = [], tips = [];
  for (let j = 0; j < N; j++) {
    const c = centres[j], from = cross[(j - 1 + N) % N], to = cross[j];
    const a0 = Math.atan2(from.y - c.y, from.x - c.x);
    let a1 = Math.atan2(to.y - c.y, to.x - c.x);
    while (a1 <= a0 + 1e-9) a1 += Math.PI * 2;
    stroke.push(['M', from.x, from.y], ...arcSegments(c.x, c.y, r, a0, a1 + tail));
    if (j === 0) fill.push(['M', from.x, from.y]);
    fill.push(...arcSegments(c.x, c.y, r, a0, a1));
    const mid = (a0 + a1) / 2;
    tips.push({ x: c.x + r * Math.cos(mid), y: c.y + r * Math.sin(mid) });
  }
  fill.push(['Z']);
  return { stroke, fill, tips };
}

/** Closest point on a rectangle's edge/inside to p. */
export function closestOnRect(p, r) {
  return { x: clamp(p.x, r.x, r.x + r.w), y: clamp(p.y, r.y, r.y + r.h) };
}

/** Leader for a callout: from the text box, a short level stub (the knee), then to the tip. */
export function calloutLeader(tip, box, kneeLen) {
  const c = closestOnRect(tip, box);
  const dx = tip.x - c.x, dy = tip.y - c.y;
  if (dx === 0 && dy === 0) return null;                 // tip is inside the text box
  let anchor, knee;
  // Like Revu: leave from the side of the box unless the tip is more or less straight above or below it.
  if (Math.abs(dx) >= Math.min(kneeLen, Math.abs(dy))) {
    const sgn = dx < 0 ? -1 : 1;
    anchor = { x: sgn < 0 ? box.x : box.x + box.w, y: box.y + box.h / 2 };
    const reach = Math.min(kneeLen, Math.abs(tip.x - anchor.x) * 0.5);
    knee = { x: anchor.x + sgn * reach, y: anchor.y };
  } else {
    const sgn = dy < 0 ? -1 : 1;
    anchor = { x: box.x + box.w / 2, y: sgn < 0 ? box.y : box.y + box.h };
    const reach = Math.min(kneeLen, Math.abs(tip.y - anchor.y) * 0.5);
    knee = { x: anchor.x, y: anchor.y + sgn * reach };
  }
  return { tip, knee, anchor };
}

/** Leader for cloud + text: straight from the text box to the nearest cloud bump. */
export function cloudLeader(tips, box) {
  let best = null, bestD = Infinity;
  for (const t of tips) {
    const c = closestOnRect(t, box);
    const d = Math.hypot(t.x - c.x, t.y - c.y);
    if (d < bestD) { bestD = d; best = { tip: t, anchor: c }; }
  }
  if (!best || bestD < 0.5) return null;
  return best;
}

/**
 * Line ending at `tip`, coming from `from`.
 * Returns { paths: [{ d, filled }], shaftEnd } — shaftEnd is where the line itself should stop.
 */
export function lineEnding(style, tip, from, width, k) {
  const len = Math.hypot(tip.x - from.x, tip.y - from.y);
  if (style === 'none' || len < 1e-6) return { paths: [], shaftEnd: tip };
  const ux = (tip.x - from.x) / len, uy = (tip.y - from.y) / len;
  const nx = -uy, ny = ux;
  const hl = Math.min((6 + 3 * width) * Math.sqrt(k), Math.max(len * 0.6, 3 * width));
  const hw = hl * 0.36;
  const bx = tip.x - ux * hl, by = tip.y - uy * hl;
  if (style === 'closed') {
    return {
      paths: [{ d: [['M', tip.x, tip.y], ['L', bx + nx * hw, by + ny * hw], ['L', bx - nx * hw, by - ny * hw], ['Z']], filled: true }],
      shaftEnd: { x: tip.x - ux * hl * 0.85, y: tip.y - uy * hl * 0.85 },
    };
  }
  if (style === 'open') {
    return {
      paths: [{ d: [['M', bx + nx * hw, by + ny * hw], ['L', tip.x, tip.y], ['L', bx - nx * hw, by - ny * hw]], filled: false }],
      shaftEnd: tip,
    };
  }
  if (style === 'dot') {
    const rr = hl * 0.3;
    return {
      paths: [{ d: [['M', tip.x + rr, tip.y], ...arcSegments(tip.x, tip.y, rr, 0, Math.PI * 2), ['Z']], filled: true }],
      shaftEnd: tip,
    };
  }
  return { paths: [], shaftEnd: tip };
}

/** Smooth path through freehand points (quadratic midpoints, written as cubics). */
export function inkPath(pts) {
  if (!pts.length) return [];
  if (pts.length === 1) return [['M', pts[0][0], pts[0][1]], ['L', pts[0][0] + 0.01, pts[0][1]]];
  if (pts.length === 2) return [['M', pts[0][0], pts[0][1]], ['L', pts[1][0], pts[1][1]]];
  const d = [['M', pts[0][0], pts[0][1]]];
  let px = pts[0][0], py = pts[0][1];
  for (let i = 1; i < pts.length - 1; i++) {
    const cx = pts[i][0], cy = pts[i][1];
    const ex = (cx + pts[i + 1][0]) / 2, ey = (cy + pts[i + 1][1]) / 2;
    d.push(['C', px + (2 / 3) * (cx - px), py + (2 / 3) * (cy - py), ex + (2 / 3) * (cx - ex), ey + (2 / 3) * (cy - ey), ex, ey]);
    px = ex; py = ey;
  }
  const last = pts[pts.length - 1];
  d.push(['L', last[0], last[1]]);
  return d;
}

/** Thin out freehand points (Ramer–Douglas–Peucker). */
export function simplify(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = pts[a][0], ay = pts[a][1], bx = pts[b][0], by = pts[b][1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
    let worst = -1, worstD = tol * tol;
    for (let i = a + 1; i < b; i++) {
      let t = len2 ? ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2 : 0;
      t = clamp(t, 0, 1);
      const ex = pts[i][0] - (ax + t * dx), ey = pts[i][1] - (ay + t * dy);
      const d2 = ex * ex + ey * ey;
      if (d2 > worstD) { worstD = d2; worst = i; }
    }
    if (worst > 0) { keep[worst] = 1; stack.push([a, worst], [worst, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Bounding box of a set of paths (control points included, so slightly generous). */
export function pathBounds(d, b) {
  b = b || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const c of d) {
    for (let i = 1; i + 1 < c.length; i += 2) {
      if (c[i] < b.x0) b.x0 = c[i];
      if (c[i] > b.x1) b.x1 = c[i];
      if (c[i + 1] < b.y0) b.y0 = c[i + 1];
      if (c[i + 1] > b.y1) b.y1 = c[i + 1];
    }
  }
  return b;
}

// ---- polygons, rotation, compact paths ----------------------------------

/** Rotate p about c by `deg` (clockwise on screen, because y runs down). */
export function rotate(p, c, deg) {
  const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a), dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + dx * cs - dy * sn, y: c.y + dx * sn + dy * cs };
}

/** Corners of a rectangle turned about its centre. */
export function rotatedCorners(r, deg) {
  const c = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  return rectCorners(r).map(p => (deg ? rotate(p, c, deg) : p));
}

export function polyPath(pts, closed) {
  const d = [['M', pts[0][0], pts[0][1]]];
  for (let i = 1; i < pts.length; i++) d.push(['L', pts[i][0], pts[i][1]]);
  if (closed) d.push(['Z']);
  return d;
}

export function polyLength(pts, closed) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  if (closed && pts.length > 2) len += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  return len;
}

export function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a) / 2;
}

/** A point well inside a polygon for its label: the centroid, or the middle of the box for odd shapes. */
export function polyCentre(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], f = p[0] * q[1] - q[0] * p[1];
    a += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  }
  if (Math.abs(a) < 1e-6) {
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export function ptsBounds(pts) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** "M1 2L3 4C5 6 7 8 9 10Z" → [['M',1,2],['L',3,4],['C',5,6,7,8,9,10],['Z']]. Absolute M, L, C and Z only. */
export function parsePath(str) {
  const out = [];
  const re = /([MLCZ])([^MLCZ]*)/g;
  let m;
  while ((m = re.exec(str))) {
    const nums = m[2].trim() ? m[2].trim().split(/[\s,]+/).map(Number) : [];
    if (m[1] === 'Z') out.push(['Z']);
    else if (m[1] === 'C') for (let i = 0; i + 5 < nums.length; i += 6) out.push(['C', ...nums.slice(i, i + 6)]);
    else for (let i = 0; i + 1 < nums.length; i += 2) out.push([i === 0 ? m[1] : 'L', nums[i], nums[i + 1]]);
  }
  return out;
}

/** Run every coordinate of a path through f(x, y) → [x, y]. */
export function mapPath(d, f) {
  return d.map(c => {
    if (c.length === 1) return c;
    const o = [c[0]];
    for (let i = 1; i + 1 < c.length; i += 2) o.push(...f(c[i], c[i + 1]));
    return o;
  });
}

export function circlePath(cx, cy, r) {
  return [['M', cx + r, cy], ...arcSegments(cx, cy, r, 0, Math.PI * 2), ['Z']];
}
