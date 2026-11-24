// Draws shape lists (from shapes.js) as SVG on top of the page.
const NS = 'http://www.w3.org/2000/svg';
const XLINK = 'http://www.w3.org/1999/xlink';

export function el(name, attrs = {}) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  return e;
}

const r2 = n => Math.round(n * 100) / 100;
export const pathD = d => d.map(c => (c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map(r2).join(' '))).join('');

let assets = null;            // set by the app: get(id) → { url }
export function setAssets(a) { assets = a; }

/** One-colour version of a picture: a filter that keeps its shape and swaps the colour. */
function tintFilter(svg, colour) {
  const id = `tint-${colour.replace('#', '')}`;
  if (!svg.querySelector(`#${id}`)) {
    let defs = svg.querySelector('defs');
    if (!defs) { defs = el('defs'); svg.insertBefore(defs, svg.firstChild); }
    const f = el('filter', { id, x: 0, y: 0, width: 1, height: 1, 'color-interpolation-filters': 'sRGB' });
    f.appendChild(el('feFlood', { 'flood-color': colour, result: 'c' }));
    f.appendChild(el('feComposite', { in: 'c', in2: 'SourceAlpha', operator: 'in' }));
    defs.appendChild(f);
  }
  return id;
}

/** Fill group `g` with the markup's shapes. With `hit`, add fat invisible grab areas. */
export function drawMarkup(g, shapes, { hit = true } = {}) {
  g.textContent = '';
  const hits = [];
  for (const part of shapes.parts) {
    for (const it of part.items) {
      if (it.t === 'path') {
        const d = pathD(it.d);
        const p = el('path', {
          d, fill: it.fill || 'none', stroke: it.stroke || 'none',
          'stroke-width': it.stroke ? r2(it.w) : null,
          'stroke-linejoin': it.join, 'stroke-linecap': it.cap,
          'stroke-opacity': it.stroke && it.opacity < 1 ? it.opacity : null,
          'fill-opacity': it.fill && it.opacity < 1 ? it.opacity : null,
          'fill-rule': it.eo ? 'evenodd' : null,
          'stroke-dasharray': it.stroke && it.dash ? it.dash.map(r2).join(' ') : null,
        });
        if (it.blend) p.style.mixBlendMode = it.blend;
        g.appendChild(p);
        if (hit && !part.hit && it.role !== 'label') hits.push(el('path', { d, class: it.fill ? 'hit hit-fill' : 'hit', 'data-role': it.role || 'body' }));
      } else if (it.t === 'image') {
        const a = assets && assets.get(it.asset);
        const im = el('image', {
          x: r2(it.x), y: r2(it.y), width: r2(it.w), height: r2(it.h), preserveAspectRatio: 'none',
          opacity: it.opacity < 1 ? it.opacity : null,
          transform: it.rot ? `rotate(${it.rot} ${r2(it.x + it.w / 2)} ${r2(it.y + it.h / 2)})` : null,
        });
        if (a && a.url) { im.setAttribute('href', a.url); im.setAttributeNS(XLINK, 'xlink:href', a.url); }
        if (it.tint && g.ownerSVGElement) im.setAttribute('filter', `url(#${tintFilter(g.ownerSVGElement, it.tint)})`);
        g.appendChild(im);
      } else {
        const t = el('text', {
          class: 'mk-text', 'font-size': r2(it.size), fill: it.color, 'fill-opacity': it.opacity < 1 ? it.opacity : null,
          transform: it.rot ? `rotate(${it.rot} ${r2(it.cx)} ${r2(it.cy)})` : null,
        });
        t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        for (const ln of it.lines) {
          const s = el('tspan', { x: r2(ln.x), y: r2(ln.y) });
          s.textContent = ln.s;
          t.appendChild(s);
        }
        g.appendChild(t);
      }
    }
    if (hit && part.hit) hits.push(el('path', { d: pathD(part.hit), class: 'hit hit-fill hit-thin', 'data-role': 'body' }));
    if (hit && part.textBox) {
      const b = part.textBox;
      hits.push(el('rect', { x: r2(b.x), y: r2(b.y), width: r2(b.w), height: r2(b.h), class: 'hit hit-fill', 'data-role': 'box' }));
    }
  }
  for (const h of hits) g.appendChild(h);
}

/** Selection outline and drag handles. `px` = page units per screen pixel. */
export function drawSelection(g, shapes, px, { editing = false } = {}) {
  g.textContent = '';
  if (!shapes) return;
  const b = shapes.bbox, pad = 4 * px;
  g.appendChild(el('rect', {
    x: r2(b.x - pad), y: r2(b.y - pad), width: r2(b.w + 2 * pad), height: r2(b.h + 2 * pad),
    class: 'sel-box', 'stroke-width': r2(1.5 * px), 'stroke-dasharray': `${r2(5 * px)} ${r2(4 * px)}`,
  }));
  if (editing) return;
  // When the shape is small on screen, keep only the corner handles so they do not pile up.
  const at = id => shapes.handles.find(x => x.id === id);
  const nw = at('nw'), se = at('se'), rot = at('rot');
  const span = nw && se ? Math.hypot(se.x - nw.x, se.y - nw.y) / px : Infinity;
  const narrow = nw && se && !rot && (se.x - nw.x) / px < 80, short = nw && se && !rot && (se.y - nw.y) / px < 80;
  for (const h0 of shapes.handles) {
    if ((narrow && (h0.id === 'n' || h0.id === 's')) || (short && (h0.id === 'w' || h0.id === 'e'))) continue;
    // A small symbol keeps two corners and the turn handle, so there is still room to grab it and move it.
    if (rot && span < 70 && (h0.id === 'nw' || h0.id === 'sw' || h0.id === 'ne')) continue;
    const off = h0.id === 'bl' ? -12 * px : h0.id === 'br' ? 12 * px : 0;
    const h = { ...h0, x: h0.x + off };
    if (rot && h.id !== 'rot') {
      // A symbol's corner handles stand just clear of it, so a small symbol can still be grabbed by its middle.
      const mx = (nw.x + se.x) / 2, my = (nw.y + se.y) / 2, len = Math.hypot(h0.x - mx, h0.y - my) || 1;
      h.x = h0.x + ((h0.x - mx) / len) * 13 * px; h.y = h0.y + ((h0.y - my) / len) * 13 * px;
    }
    if (h.id === 'rot') {
      // Keep the turn handle a steady finger's distance off the symbol, whatever the zoom.
      const mid = { x: (nw.x + se.x) / 2, y: (nw.y + se.y) / 2 };
      const len = Math.hypot(h0.x - mid.x, h0.y - mid.y) || 1, edge = len - 16 * (shapes.k || 1);
      const far = Math.max(len, edge + 30 * px);
      h.x = mid.x + ((h0.x - mid.x) / len) * far; h.y = mid.y + ((h0.y - mid.y) / len) * far;
      const ex = mid.x + ((h0.x - mid.x) / len) * edge, ey = mid.y + ((h0.y - mid.y) / len) * edge;
      g.appendChild(el('line', { x1: r2(ex), y1: r2(ey), x2: r2(h.x), y2: r2(h.y), class: 'sel-box', 'stroke-width': r2(1.5 * px) }));
    }
    const hg = el('g', { 'data-handle': h.id });
    hg.appendChild(el('circle', { cx: r2(h.x), cy: r2(h.y), r: r2((rot ? 13 : 20) * px), class: 'handle-hit' }));
    hg.appendChild(el('circle', { cx: r2(h.x), cy: r2(h.y), r: r2(7 * px), class: h.id === 'rot' ? 'handle turn' : 'handle', 'stroke-width': r2(2 * px) }));
    g.appendChild(hg);
  }
}
