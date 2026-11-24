// Draws shape lists (from shapes.js) as SVG on top of the page.
const NS = 'http://www.w3.org/2000/svg';

export function el(name, attrs = {}) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  return e;
}

const r2 = n => Math.round(n * 100) / 100;
export const pathD = d => d.map(c => (c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map(r2).join(' '))).join('');

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
        });
        if (it.blend) p.style.mixBlendMode = it.blend;
        g.appendChild(p);
        if (hit) hits.push(el('path', { d, class: it.fill ? 'hit hit-fill' : 'hit', 'data-role': it.role || 'body' }));
      } else {
        const t = el('text', { class: 'mk-text', 'font-size': r2(it.size), fill: it.color, 'fill-opacity': it.opacity < 1 ? it.opacity : null });
        t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
        for (const ln of it.lines) {
          const s = el('tspan', { x: r2(ln.x), y: r2(ln.y) });
          s.textContent = ln.s;
          t.appendChild(s);
        }
        g.appendChild(t);
      }
    }
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
  const nw = at('nw'), se = at('se');
  const narrow = nw && se && (se.x - nw.x) / px < 80, short = nw && se && (se.y - nw.y) / px < 80;
  for (const h0 of shapes.handles) {
    if ((narrow && (h0.id === 'n' || h0.id === 's')) || (short && (h0.id === 'w' || h0.id === 'e'))) continue;
    const off = h0.id === 'bl' ? -12 * px : h0.id === 'br' ? 12 * px : 0;
    const h = { ...h0, x: h0.x + off };
    const hg = el('g', { 'data-handle': h.id });
    hg.appendChild(el('circle', { cx: r2(h.x), cy: r2(h.y), r: r2(20 * px), class: 'handle-hit' }));
    hg.appendChild(el('circle', { cx: r2(h.x), cy: r2(h.y), r: r2(7 * px), class: 'handle', 'stroke-width': r2(2 * px) }));
    g.appendChild(hg);
  }
}
