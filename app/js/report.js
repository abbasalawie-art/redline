// The markups list, symbol counts, and the site report (Word, PDF or Excel).
import { icon } from './icons.js';
import { measureOf, MEASURE_TYPES, TEXT_TYPES } from './shapes.js';
import { docx, xlsx, DOCX_MIME, XLSX_MIME } from './office.js';
import { TOOL_NAME } from './ui.js';
import { canvasBytes } from './assets.js';

const firstLine = s => String(s || '').split('\n')[0];

export function initReport(app) {
  const { h } = app.ui, assets = app.assets;

  /** Everything on the drawing, sorted into what the list and the report show. */
  function gather() {
    const all = app.markups.slice().sort((a, b) => a.page - b.page);
    const pins = all.filter(m => m.type === 'pin').sort((a, b) => a.n - b.n);
    const notes = all.filter(m => TEXT_TYPES.has(m.type) && (m.text || '').trim());
    const measures = all.filter(m => MEASURE_TYPES.has(m.type));
    const stamps = all.filter(m => m.type === 'stamp');
    const rest = all.filter(m => m.type !== 'pin' && m.type !== 'stamp' && !MEASURE_TYPES.has(m.type) && !(TEXT_TYPES.has(m.type) && (m.text || '').trim()));
    const counts = new Map();       // symbol name → { total, pages: Map(page → n) }
    for (const m of stamps) {
      const name = m.name || 'Symbol';
      const c = counts.get(name) || { total: 0, pages: new Map() };
      c.total++; c.pages.set(m.page, (c.pages.get(m.page) || 0) + 1);
      counts.set(name, c);
    }
    const sorted = [...counts].sort((a, b) => a[0].localeCompare(b[0]));
    return { all, pins, notes, measures, stamps, rest, counts: sorted };
  }
  const pagesText = c => [...c.pages].sort((a, b) => a[0] - b[0]).map(([p, n]) => `p${p + 1}: ${n}`).join(', ');
  const measureRow = m => { const q = measureOf(m); return m.type === 'area' ? [TOOL_NAME.area, q.label, `${q.length.toFixed(2)} m round`] : [m.type === 'path' ? 'Run' : 'Length', q.label, '']; };

  // ---- the list -----------------------------------------------------------
  function open() {
    if (!app.doc) return;
    if (app.editing) app.commitEdit();
    app.tools.cancelPending();
    const g = gather(), here = app.doc.pageIndex;
    const go = m => { app.ui.closeSheet(); app.reveal(m); };
    const row = (lead, main, m, extra) => h('button', { class: 'rowbtn', onclick: () => go(m) },
      h('span', { class: 'row-n' }, lead), h('span', { class: 'row-main' }, main || h('i', {}, 'no note')), extra || null, h('span', { class: 'row-p' }, `p ${m.page + 1}`));
    const body = [];

    body.push(h('div', { class: 'row tight' },
      h('button', { class: 'btn slim', html: `${icon('doc', 20)}<span>Word report</span>`, onclick: () => build('docx') }),
      h('button', { class: 'btn slim', html: `${icon('doc', 20)}<span>PDF report</span>`, onclick: () => build('pdf') }),
      h('button', { class: 'btn slim', html: `${icon('pages', 20)}<span>Excel</span>`, onclick: () => build('xlsx') })));

    if (!g.all.length) body.push(h('div', { class: 'empty' }, 'Nothing marked on this drawing yet.'));

    if (g.counts.length) {
      const t = h('table', { class: 'counts' }, h('tr', {}, h('th', {}, 'Symbol'), h('th', {}, 'This page'), h('th', {}, 'Whole drawing')));
      for (const [name, c] of g.counts) t.append(h('tr', {}, h('td', {}, name), h('td', {}, String(c.pages.get(here) || 0)), h('td', {}, String(c.total))));
      t.append(h('tr', { class: 'sum' }, h('td', {}, 'All symbols'), h('td', {}, String(g.stamps.filter(m => m.page === here).length)), h('td', {}, String(g.stamps.length))));
      body.push(h('h3', {}, 'Symbol counts'), t);
    }
    if (g.pins.length) {
      body.push(h('h3', {}, `Pins · ${g.pins.length}`), h('div', { class: 'rows' },
        g.pins.map(m => row(String(m.n), firstLine(m.note), m, m.photo ? h('span', { class: 'row-ic', html: icon('camera', 18) }) : null))));
    }
    if (g.measures.length) {
      body.push(h('h3', {}, `Measurements · ${g.measures.length}`), h('div', { class: 'rows' }, g.measures.map(m => { const r = measureRow(m); return row(r[0], `${r[1]}${r[2] ? ` · ${r[2]}` : ''}`, m); })));
    }
    if (g.notes.length) {
      body.push(h('h3', {}, `Notes · ${g.notes.length}`), h('div', { class: 'rows' }, g.notes.map(m => row(TOOL_NAME[m.type], firstLine(m.text), m))));
    }
    if (g.rest.length) {
      body.push(h('h3', {}, `Other markups · ${g.rest.length}`), h('div', { class: 'rows' }, g.rest.map(m => row(TOOL_NAME[m.type] || m.type, ' ', m))));
    }
    app.ui.openSheet('Markups', body, { wide: true });
  }

  // ---- pictures for the report -------------------------------------------
  /** A picture of the drawing around a pin, with every markup on it. */
  async function snapshot(pdf, m) {
    const info = await app.viewer.pageInfo(m.page);
    const w = Math.min(info.w, 320 * info.k), hh = Math.min(info.h, w * 0.62);
    const r = { x: Math.max(0, Math.min(info.w - w, m.p.x - w / 2)), y: Math.max(0, Math.min(info.h - hh, m.p.y - hh / 2)), w, h: hh };
    const canvas = await app.viewer.renderRegion(m.page, r, 820 / w, { background: '#ffffff', source: pdf });
    return { bytes: await canvasBytes(canvas, 'image/jpeg', 0.82), mime: 'image/jpeg', w: canvas.width, h: canvas.height };
  }

  async function build(kind) {
    app.ui.closeSheet();
    app.ui.busy('Building report…');
    try {
      const g = gather();
      const title = app.doc.name.replace(/\.pdf$/i, '');
      const when = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      const author = app.prefs.author || '';
      await assets.load(g.pins.map(m => m.photo));
      const snaps = new Map();
      if (kind !== 'xlsx' && g.pins.length) {
        const pdf = await app.loadPdfjs(await app.buildPdf({ flatten: true, photoPages: false }));
        try { for (const m of g.pins) snaps.set(m.id, await snapshot(pdf, m)); } finally { app.closePdf(pdf); }
      }
      const photos = g.pins.filter(m => m.photo && assets.get(m.photo)).length;
      const summary = [`${g.pins.length} ${g.pins.length === 1 ? 'pin' : 'pins'}`, `${photos} ${photos === 1 ? 'photo' : 'photos'}`, `${g.stamps.length} ${g.stamps.length === 1 ? 'symbol' : 'symbols'}`, `${g.measures.length} ${g.measures.length === 1 ? 'measurement' : 'measurements'}`].join(' · ');
      const data = { g, title, when, author, snaps, summary };
      let bytes, mime, ext;
      if (kind === 'docx') { bytes = word(data); mime = DOCX_MIME; ext = 'docx'; }
      else if (kind === 'xlsx') { bytes = excel(data); mime = XLSX_MIME; ext = 'xlsx'; }
      else { bytes = await pdfReport(data); mime = 'application/pdf'; ext = 'pdf'; }
      app.ui.busy(null);
      app.ui.deliver(bytes, app.exportName('report', ext), mime, summary);
    } catch (e) {
      console.error(e);
      app.ui.busy(null);
      app.ui.alert('The report did not build', String((e && e.message) || e));
    }
  }

  const countRows = g => g.counts.map(([name, c]) => [name, c.total, pagesText(c)]);
  const measureRows = g => g.measures.map(m => { const r = measureRow(m); return [r[0], `${r[1]}${r[2] ? ` (${r[2]})` : ''}`, m.page + 1]; });
  const noteRows = g => g.notes.map(m => [m.page + 1, TOOL_NAME[m.type], m.text]);

  // ---- Word ---------------------------------------------------------------
  function word({ g, title, when, author, snaps, summary }) {
    const b = [{ h: 'Site report', level: 0 }, { p: `${title}\n${when}${author ? ` · ${author}` : ''}`, muted: true }, { p: summary }];
    if (g.pins.length) b.push({ h: 'Pins', level: 1 });
    for (const m of g.pins) {
      b.push({ h: `${m.n}. ${firstLine(m.note) || 'No note'}`, level: 2 });
      const more = String(m.note || '').split('\n').slice(1).join('\n').trim();
      b.push({ p: `Page ${m.page + 1}${more ? `\n${more}` : ''}`, muted: !more });
      const snap = snaps.get(m.id), photo = m.photo && assets.get(m.photo);
      if (snap && photo) b.push({ table: [[{ img: snap, width: 8 }, { img: photo, width: photo.w >= photo.h ? 8 : 5.2 }]], widths: [8.4, 8.4] });
      else if (snap) b.push({ img: snap, width: 9 });
    }
    if (g.counts.length) b.push({ h: 'Symbol counts', level: 1 }, { table: [['Symbol', 'Count', 'Where'], ...countRows(g)], header: true, widths: [8, 2.5, 6] });
    if (g.measures.length) b.push({ h: 'Measurements', level: 1 }, { table: [['Type', 'Value', 'Page'], ...measureRows(g)], header: true, widths: [5, 9, 2.5] });
    if (g.notes.length) b.push({ h: 'Notes on the drawing', level: 1 }, { table: [['Page', 'Markup', 'Note'], ...noteRows(g)], header: true, widths: [2, 3, 11.5] });
    return docx(b, { title: `Site report: ${title}`, author: author || 'Redline' });
  }

  // ---- Excel --------------------------------------------------------------
  function excel({ g }) {
    const pages = [...new Set(g.stamps.map(m => m.page))].sort((a, b) => a - b);
    return xlsx([
      { name: 'Pins', widths: [6, 6, 60, 8], rows: [['No', 'Page', 'Note', 'Photo'], ...g.pins.map(m => [m.n, m.page + 1, m.note || '', m.photo ? 'Yes' : 'No'])] },
      { name: 'Symbol counts', widths: [36, 8, ...pages.map(() => 9)], rows: [['Symbol', 'Total', ...pages.map(p => `Page ${p + 1}`)], ...g.counts.map(([name, c]) => [name, c.total, ...pages.map(p => c.pages.get(p) || 0)])] },
      { name: 'Measurements', widths: [10, 12, 8, 14, 6], rows: [['Type', 'Value', 'Unit', 'Perimeter (m)', 'Page'], ...g.measures.map(m => { const q = measureOf(m); return m.type === 'area' ? ['Area', Math.round(q.area * 1000) / 1000, 'm²', Math.round(q.length * 1000) / 1000, m.page + 1] : [m.type === 'path' ? 'Run' : 'Length', Math.round(q.length * 1000) / 1000, 'm', '', m.page + 1]; })] },
      { name: 'Notes', widths: [6, 12, 80], rows: [['Page', 'Markup', 'Note'], ...noteRows(g)] },
    ]);
  }

  // ---- PDF ----------------------------------------------------------------
  async function pdfReport({ g, title, when, author, snaps, summary }) {
    const { PDFLib, font } = app;
    const pdf = await PDFLib.PDFDocument.create();
    const reg = await pdf.embedFont(PDFLib.StandardFonts.Helvetica), bold = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold);
    const W = 595.28, H = 841.89, M = 42, ink = PDFLib.rgb(0.08, 0.09, 0.11), grey = PDFLib.rgb(0.4, 0.44, 0.5), line = PDFLib.rgb(0.8, 0.82, 0.85);
    let page = pdf.addPage([W, H]), y = H - M;
    const room = need => { if (y - need < M) { page = pdf.addPage([W, H]); y = H - M; } };
    const wrapWith = (f, text, size, width) => {
      const out = [];
      for (const para of font.clean(text).split('\n')) {
        let cur = '';
        for (const word of para.split(' ')) {
          const cand = cur ? `${cur} ${word}` : word;
          if (f.widthOfTextAtSize(cand, size) <= width || !cur) cur = cand; else { out.push(cur); cur = word; }
        }
        out.push(cur);
      }
      return out;
    };
    const text = (s, { size = 10.5, f = reg, color = ink, x = M, width = W - 2 * M, gap = 4 } = {}) => {
      for (const ln of wrapWith(f, s, size, width)) { room(size * 1.3); y -= size * 1.25; if (ln) page.drawText(ln, { x, y, size, font: f, color }); }
      y -= gap;
    };
    const heading = (s, size) => { room(size * 3); y -= size * 0.7; text(s, { size, f: bold, gap: 5 }); };
    const table = (rows, widths) => {
      const total = widths.reduce((a, b) => a + b, 0), ws = widths.map(w => (w / total) * (W - 2 * M));
      rows.forEach((r, ri) => {
        const f = ri === 0 ? bold : reg, cells = r.map((c, ci) => wrapWith(f, String(c ?? ''), 9.5, ws[ci] - 8));
        const hh = Math.max(...cells.map(c => c.length)) * 12 + 6;
        room(hh);
        if (ri === 0) page.drawRectangle({ x: M, y: y - hh, width: W - 2 * M, height: hh, color: PDFLib.rgb(0.93, 0.945, 0.96) });
        let cx = M;
        cells.forEach((lines, ci) => { lines.forEach((ln, k) => { if (ln) page.drawText(ln, { x: cx + 4, y: y - 13 - k * 12, size: 9.5, font: f, color: ink }); }); cx += ws[ci]; });
        y -= hh;
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
      });
      y -= 10;
    };
    const embed = async im => (im.mime === 'image/png' ? pdf.embedPng(im.bytes) : pdf.embedJpg(im.bytes));

    text('Site report', { size: 24, f: bold, gap: 2 });
    text(`${title}\n${when}${author ? ` · ${author}` : ''}`, { color: grey, gap: 6 });
    text(summary, { gap: 8 });

    if (g.pins.length) heading('Pins', 15);
    for (const m of g.pins) {
      const snap = snaps.get(m.id), photo = m.photo && assets.get(m.photo);
      const colW = (W - 2 * M - 12) / 2;
      const sh = snap ? (colW * snap.h) / snap.w : 0, ph = photo ? Math.min((colW * photo.h) / photo.w, 260) : 0;
      room(40 + Math.max(sh, ph));
      text(`${m.n}. ${firstLine(m.note) || 'No note'}`, { size: 12, f: bold, gap: 1 });
      const more = String(m.note || '').split('\n').slice(1).join('\n').trim();
      if (more) text(more, { gap: 1 });
      text(`Page ${m.page + 1}`, { size: 9.5, color: grey, gap: 5 });
      if (snap) page.drawImage(await embed(snap), { x: M, y: y - sh, width: colW, height: sh });
      if (photo) { const pw = (ph * photo.w) / photo.h; page.drawImage(await embed(photo), { x: M + colW + 12, y: y - ph, width: pw, height: ph }); }
      y -= Math.max(sh, ph) + 14;
    }
    if (g.counts.length) { heading('Symbol counts', 15); table([['Symbol', 'Count', 'Where'], ...countRows(g)], [8, 2, 6]); }
    if (g.measures.length) { heading('Measurements', 15); table([['Type', 'Value', 'Page'], ...measureRows(g)], [4, 9, 2]); }
    if (g.notes.length) { heading('Notes on the drawing', 15); table([['Page', 'Markup', 'Note'], ...noteRows(g)], [1.5, 3, 12]); }
    return pdf.save();
  }

  app.report = { open, gather };
}
