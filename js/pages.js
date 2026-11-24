// Page tools: turn, move, add, merge, pull out and delete pages of the open drawing.
import { icon } from './icons.js';
import { rotateQuarter } from './shapes.js';
import { loadDoc } from './pdf-export.js';

const clone = o => JSON.parse(JSON.stringify(o));

/** "2-5, 8" → [1, 2, 3, 4, 7] (zero-based, in order, no repeats), or null if it makes no sense. */
export function parseRange(text, count) {
  const out = new Set();
  for (const part of String(text).split(/[,;\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = Number(m[1]), b = m[2] ? Number(m[2]) : a;
    if (a < 1 || b > count || a > b) return null;
    for (let i = a; i <= b; i++) out.add(i - 1);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

export function initPages(app) {
  const { h } = app.ui, { PDFLib } = app, $ = id => document.getElementById(id);
  let reopen = () => {};
  const openDoc = () => loadDoc(PDFLib, app.doc.bytes, app.doc.password);

  async function run(label, fn) {
    if (app.editing) app.commitEdit();
    app.ui.busy(label);
    try { await fn(); reopen(); }
    catch (e) { console.error(e); app.ui.busy(null); app.ui.alert('That did not work', 'The pages of this PDF could not be changed.'); }
    finally { app.ui.busy(null); }
  }

  /** Save the edited PDF and carry markups and per-page scales over to the new page numbers. */
  async function commit(pdf, map, at, edit) {
    const markups = [];
    for (const m of app.markups) {
      const p = map(m.page);
      if (p < 0) continue;
      const c = clone(m);
      if (edit) edit(c);
      c.page = p;
      markups.push(c);
    }
    const scales = {};
    for (const [k, v] of Object.entries(app.doc.scale.pages)) { const p = map(Number(k)); if (p >= 0) scales[p] = v; }
    app.doc.scale.pages = scales;
    await app.replaceBytes(await pdf.save(), markups, at);
  }

  /** Turn the page in view clockwise by `quarters` quarter turns (3 = one turn anticlockwise). */
  const turn = (quarters = 1) => run('Turning…', async () => {
    const i = app.doc.pageIndex, { w, h: ph } = app.doc.pageInfo;
    const pdf = await openDoc(), page = pdf.getPage(i);
    page.setRotation(PDFLib.degrees((page.getRotation().angle + 90 * quarters) % 360));
    await commit(pdf, p => p, i, m => {
      if (m.page !== i) return;
      for (let q = 0, pw = w, hh = ph; q < quarters; q++, [pw, hh] = [hh, pw]) rotateQuarter(m, pw, hh);
    });
  });

  const move = d => run('Moving…', async () => {
    const i = app.doc.pageIndex, j = i + d;
    if (j < 0 || j >= app.doc.pageCount) return;
    const pdf = await openDoc(), page = pdf.getPage(i);
    pdf.removePage(i);
    pdf.context.assign(page.ref, page.node);        // removePage throws the page object away; this is the same page going back in
    pdf.insertPage(j, page);
    await commit(pdf, p => (p === i ? j : p === j ? i : p), j);
  });

  const blank = () => run('Adding…', async () => {
    const i = app.doc.pageIndex;
    const pdf = await openDoc(), cur = pdf.getPage(i);
    const page = pdf.insertPage(i + 1, [cur.getWidth(), cur.getHeight()]);
    page.setRotation(cur.getRotation());
    await commit(pdf, p => (p > i ? p + 1 : p), i + 1);
  });

  const remove = () => {
    const d = app.doc, i = d.pageIndex;
    if (d.pageCount < 2) return app.ui.toast('A PDF needs at least one page');
    const n = app.markups.filter(m => m.page === i).length;
    if (!window.confirm(`Delete page ${i + 1}${n ? ` and its ${n} ${n === 1 ? 'markup' : 'markups'}` : ''}? This cannot be undone.`)) return;
    run('Deleting…', async () => {
      const pdf = await openDoc();
      pdf.removePage(i);
      await commit(pdf, p => (p === i ? -1 : p > i ? p - 1 : p), Math.min(i, d.pageCount - 2));
    });
  };

  $('file-merge').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !app.doc) return;
    run('Adding pages…', async () => {
      const first = app.doc.pageCount;
      const pdf = await openDoc();
      const src = await loadDoc(PDFLib, new Uint8Array(await f.arrayBuffer()));
      for (const p of await pdf.copyPages(src, src.getPageIndices())) pdf.addPage(p);
      await commit(pdf, p => p, first);
      app.ui.toast(`${src.getPageCount()} ${src.getPageCount() === 1 ? 'page' : 'pages'} added at the end`);
    });
  });

  const extract = () => {
    const d = app.doc;
    const text = window.prompt(`Which pages to pull out into a new PDF? (1 to ${d.pageCount}, e.g. 2-5, 8)`, String(d.pageIndex + 1));
    if (text == null) return;
    const keep = parseRange(text, d.pageCount);
    if (!keep) return app.ui.toast('Type page numbers like 2-5, 8');
    run('Building PDF…', async () => {
      const pdf = await PDFLib.PDFDocument.load(await app.buildPdf({ photoPages: false }), { updateMetadata: false });
      for (let i = pdf.getPageCount() - 1; i >= 0; i--) if (!keep.includes(i)) pdf.removePage(i);
      const bytes = await pdf.save();
      reopen = () => {};
      app.ui.deliver(bytes, app.exportName('pages'), 'application/pdf', `${keep.length} ${keep.length === 1 ? 'page' : 'pages'}, with their markups still editable.`);
    });
  };

  /** The row of page buttons at the top of the Pages sheet. They act on the page being viewed. */
  function toolbar(again) {
    reopen = again;
    const d = app.doc, i = d.pageIndex;
    const b = (name, label, onclick, off, cls = '') => h('button', { class: `btn slim ${cls}`, disabled: off, onclick, html: `${icon(name, 20)}<span>${label}</span>` });
    return h('div', { class: 'page-tools' },
      h('div', { class: 'muted' }, `Page ${i + 1} of ${d.pageCount}${d.writable ? '' : ' · this PDF cannot be changed'}`),
      d.writable ? h('div', { class: 'row tight' },
        b('turn', 'Turn', () => turn(1)),
        b('left', 'Earlier', () => move(-1), i === 0),
        b('right', 'Later', () => move(1), i >= d.pageCount - 1),
        b('plus', 'Blank page', blank),
        b('merge', 'Add a PDF', () => $('file-merge').click()),
        b('extract', 'Pull out', extract),
        b('trash', 'Delete', remove, d.pageCount < 2, 'danger')) : null);
  }

  // From the keyboard there is no Pages sheet to redraw afterwards.
  const quiet = fn => (...a) => { reopen = () => {}; return fn(...a); };
  app.pagesTool = { toolbar, turn: quiet(turn), blank: quiet(blank), remove: quiet(remove), extract: quiet(extract), addPdf: quiet(() => $('file-merge').click()) };
}
