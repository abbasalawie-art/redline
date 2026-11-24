// Fillable PDF forms: shows each field over the page, takes answers by tap, and hands them to the exporter.
import { el } from './render-svg.js';

const r2 = n => Math.round(n * 100) / 100;

export function initForms(app) {
  const { h } = app.ui;
  let pages = new Map();        // page index → [field]

  function reset() { pages = new Map(); app.el.fields.textContent = ''; }

  async function fieldsOf(i) {
    if (pages.has(i)) return pages.get(i);
    const doc = app.doc, list = [];
    try {
      const page = await doc.pdf.getPage(i + 1);
      const vp = page.getViewport({ scale: 1 });
      for (const a of await page.getAnnotations({ intent: 'display' })) {
        if (a.subtype !== 'Widget' || !a.fieldName || a.hidden || a.readOnly) continue;
        const type = a.fieldType === 'Tx' ? 'text' : a.fieldType === 'Ch' ? 'choice' : a.fieldType === 'Btn' && a.checkBox ? 'check' : a.fieldType === 'Btn' && a.radioButton ? 'radio' : null;
        if (!type) continue;
        const t = vp.transform, at = (x, y) => [t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5]];
        const [x0, y0] = at(a.rect[0], a.rect[1]), [x1, y1] = at(a.rect[2], a.rect[3]);
        const rect = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
        const options = (a.options || []).map(o => ({ value: o.exportValue, label: o.displayValue || o.exportValue }));
        let initial;
        if (type === 'text') initial = a.fieldValue || '';
        else if (type === 'check') initial = !!a.fieldValue && a.fieldValue !== 'Off' && (a.exportValue == null || a.fieldValue === a.exportValue);
        else if (type === 'radio') initial = a.fieldValue && a.fieldValue !== 'Off' ? a.fieldValue : null;
        else { const v = Array.isArray(a.fieldValue) ? a.fieldValue[0] : a.fieldValue; initial = (options.find(o => o.value === v) || { label: v || '' }).label; }
        list.push({
          name: a.fieldName, type, rect, initial, options, on: a.buttonValue ?? a.exportValue ?? 'Yes',
          multiline: !!a.multiLine, max: a.maxLen || 0, size: (a.defaultAppearanceData && a.defaultAppearanceData.fontSize) || 0,
          label: a.alternativeText || a.fieldName,
        });
      }
    } catch (e) { console.warn('form fields not read', e); }
    if (app.doc === doc) pages.set(i, list);
    return list;
  }

  const valueOf = f => (f.name in app.doc.form ? app.doc.form[f.name] : f.initial);

  async function render() {
    const doc = app.doc, g = app.el.fields;
    g.textContent = '';
    if (!doc) return;
    const i = doc.pageIndex, list = await fieldsOf(i);
    if (app.doc !== doc || doc.pageIndex !== i) return;
    g.textContent = '';
    list.forEach((f, idx) => {
      const r = f.rect, v = valueOf(f);
      const fg = el('g', { 'data-field': `${i}:${idx}`, class: 'fld' });
      if (f.type === 'radio') {
        const rad = Math.min(r.w, r.h) / 2;
        fg.appendChild(el('circle', { cx: r2(r.x + r.w / 2), cy: r2(r.y + r.h / 2), r: r2(rad), class: 'fld-box' }));
        if (v === f.on) fg.appendChild(el('circle', { cx: r2(r.x + r.w / 2), cy: r2(r.y + r.h / 2), r: r2(rad * 0.5), class: 'fld-mark' }));
      } else {
        fg.appendChild(el('rect', { x: r2(r.x), y: r2(r.y), width: r2(r.w), height: r2(r.h), class: 'fld-box' }));
        if (f.type === 'check') {
          if (v) {
            const s = Math.min(r.w, r.h), x = r.x + (r.w - s) / 2, y = r.y + (r.h - s) / 2;
            fg.appendChild(el('path', { d: `M${r2(x + s * 0.2)} ${r2(y + s * 0.52)}L${r2(x + s * 0.42)} ${r2(y + s * 0.74)}L${r2(x + s * 0.8)} ${r2(y + s * 0.26)}`, class: 'fld-tick', 'stroke-width': r2(s * 0.13) }));
          }
        } else {
          const text = String(v ?? '');
          // A readable size that fits the box; long answers in a big box shrink until they fit.
          let size = Math.min(f.size || 12, f.multiline ? 12 : 14, r.h * 0.7);
          const pad = Math.min(3, size * 0.3);
          const inner = el('svg', { x: r2(r.x), y: r2(r.y), width: r2(r.w), height: r2(r.h), overflow: 'hidden' });
          let lines = f.multiline ? app.font.wrap(text, size, Math.max(size, r.w - 2 * pad)) : [text];
          while (f.multiline && size > 6 && lines.length * size * 1.2 + 2 * pad > r.h) { size -= 0.5; lines = app.font.wrap(text, size, Math.max(size, r.w - 2 * pad)); }
          const t = el('text', { class: 'mk-text fld-text', 'font-size': r2(size) });
          t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
          lines.forEach((ln, k) => {
            const s = el('tspan', { x: r2(pad), y: r2(f.multiline ? pad + size * 0.9 + k * size * 1.2 : r.h / 2 + size * 0.36) });
            s.textContent = ln;
            t.appendChild(s);
          });
          inner.appendChild(t);
          fg.appendChild(inner);
          if (f.type === 'choice') fg.appendChild(el('path', { d: `M${r2(r.x + r.w - 9)} ${r2(r.y + r.h / 2 - 2)}l3 4 3-4`, class: 'fld-caret' }));
        }
      }
      g.appendChild(fg);
    });
  }

  function set(f, v) {
    app.doc.form[f.name] = v;
    app.touch();
    render();
  }

  /** A tap on a field: tick it, or open something to type or choose in. */
  async function tap(id) {
    const [pi, idx] = id.split(':').map(Number);
    const f = (await fieldsOf(pi))[idx];
    if (!f) return;
    const v = valueOf(f);
    if (f.type === 'check') return set(f, !v);
    if (f.type === 'radio') return set(f, v === f.on ? null : f.on);
    if (f.type === 'choice') {
      app.ui.openSheet(f.label, [
        ...f.options.map(o => h('button', { class: 'choice', 'aria-pressed': String(o.label === v), onclick: () => { app.ui.closeSheet(); set(f, o.label); } }, h('b', {}, o.label || '(blank)'))),
        h('button', { class: 'btn', onclick: () => { app.ui.closeSheet(); set(f, ''); } }, 'Clear'),
      ]);
      return;
    }
    const input = f.multiline
      ? h('textarea', { class: 'note-in', rows: 5, 'aria-label': f.label })
      : h('input', { type: 'text', class: 'line-in', 'aria-label': f.label, maxlength: f.max || null });
    input.value = String(v ?? '');
    const save = () => { const text = input.value; app.ui.closeSheet(); set(f, text); };
    if (!f.multiline) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    app.ui.openSheet(f.label, [
      input,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { input.value = ''; input.focus(); } }, 'Clear'),
        h('button', { class: 'btn primary', onclick: save }, 'Done')),
    ]);
    setTimeout(() => { input.focus(); if (input.setSelectionRange) input.setSelectionRange(input.value.length, input.value.length); }, 60);
  }

  app.forms = { reset, render, tap, fieldsOf };
}
