// The markups list, counts, and the site report (Word, PDF or Excel).
import { icon } from './icons.js';
import { measureOf, MEASURE_TYPES, TEXT_TYPES, PIN_STATUS, statusOf, photosOf, pinColour } from './shapes.js';
import { docx, xlsx, DOCX_MIME, XLSX_MIME } from './office.js';
import { TOOL_NAME } from './ui.js';
import { canvasBytes } from './assets.js';

const firstLine = s => String(s || '').split('\n')[0];
const restOf = s => String(s || '').split('\n').slice(1).join('\n').trim();
const day = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const STATUS_ORDER = ['open', 'rejected', 'fixed'];        // what still needs doing comes first

function dataUrlBytes(url) {
  const bin = atob(url.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function initReport(app) {
  const { h } = app.ui, assets = app.assets;
  let filter = 'all';

  /** Everything on the drawing, sorted into what the list and the report show. */
  function gather() {
    const all = app.markups.slice().sort((a, b) => a.page - b.page);
    const pins = all.filter(m => m.type === 'pin').sort((a, b) => a.n - b.n);
    const notes = all.filter(m => TEXT_TYPES.has(m.type) && (m.text || '').trim());
    const measures = all.filter(m => MEASURE_TYPES.has(m.type));
    const stamps = all.filter(m => m.type === 'stamp');
    const tallies = all.filter(m => m.type === 'count');
    const rest = all.filter(m => !['pin', 'stamp', 'count'].includes(m.type) && !MEASURE_TYPES.has(m.type) && !(TEXT_TYPES.has(m.type) && (m.text || '').trim()));
    // name → { total, pages: Map(page → n), kind }: placed symbols and things ticked off with the count tool
    const counts = new Map();
    const add = (name, kind, page, n) => {
      const key = `${kind}|${name}`, c = counts.get(key) || { name, kind, total: 0, pages: new Map() };
      c.total += n; c.pages.set(page, (c.pages.get(page) || 0) + n);
      counts.set(key, c);
    };
    for (const m of stamps) add(m.name || 'Symbol', 'Symbol', m.page, 1);
    for (const m of tallies) add(m.label || 'Counted', 'Counted', m.page, m.pts.length);
    const sorted = [...counts.values()].sort((a, b) => a.kind.localeCompare(b.kind) * -1 || a.name.localeCompare(b.name));
    const byStatus = Object.fromEntries(STATUS_ORDER.map(s => [s, pins.filter(m => statusOf(m) === s)]));
    return { all, pins, byStatus, notes, measures, stamps, tallies, rest, counts: sorted };
  }
  const pagesText = c => [...c.pages].sort((a, b) => a[0] - b[0]).map(([p, n]) => `p${p + 1}: ${n}`).join(', ');
  const measureRow = m => { const q = measureOf(m); return m.type === 'area' ? [TOOL_NAME.area, q.label, `${q.length.toFixed(2)} m round`] : [m.type === 'path' ? 'Run' : 'Length', q.label, '']; };
  const statusLine = m => (statusOf(m) === 'open' ? 'Open' : `${PIN_STATUS[statusOf(m)].label}${m.statusAt ? ` ${day(m.statusAt)}` : ''}`);

  // ---- the list -----------------------------------------------------------
  function open() {
    if (!app.doc) return;
    if (app.editing) app.commitEdit();
    app.tools.cancelPending();
    const g = gather(), here = app.doc.pageIndex;
    const go = m => { app.ui.closeSheet(); app.reveal(m); };
    const row = (lead, main, m, extra) => h('button', { class: 'rowbtn', onclick: () => go(m) },
      lead, h('span', { class: 'row-main' }, main || h('i', {}, 'no note')), extra || null, h('span', { class: 'row-p' }, `p ${m.page + 1}`));
    const tag = t => h('span', { class: 'row-n' }, t);
    const body = [];

    body.push(h('div', { class: 'row tight' },
      h('button', { class: 'btn slim', html: `${icon('doc', 20)}<span>Word report</span>`, onclick: () => build('docx') }),
      h('button', { class: 'btn slim', html: `${icon('doc', 20)}<span>PDF report</span>`, onclick: () => build('pdf') }),
      h('button', { class: 'btn slim', html: `${icon('pages', 20)}<span>Excel</span>`, onclick: () => build('xlsx') }),
      h('button', { class: 'btn slim', html: `${icon('edit', 20)}<span>Report details</span>`, onclick: details })));

    if (!g.all.length) body.push(h('div', { class: 'empty' }, 'Nothing marked on this drawing yet.'));

    if (g.counts.length) {
      const t = h('table', { class: 'counts' }, h('tr', {}, h('th', {}, 'Count'), h('th', {}, 'This page'), h('th', {}, 'Whole drawing')));
      for (const c of g.counts) t.append(h('tr', {}, h('td', {}, c.name, c.kind === 'Counted' ? h('span', { class: 'muted' }, '  · counted') : null), h('td', {}, String(c.pages.get(here) || 0)), h('td', {}, String(c.total))));
      if (g.stamps.length) t.append(h('tr', { class: 'sum' }, h('td', {}, 'All symbols placed'), h('td', {}, String(g.stamps.filter(m => m.page === here).length)), h('td', {}, String(g.stamps.length))));
      body.push(h('h3', {}, 'Counts'), t);
    }
    if (g.pins.length) {
      if (filter !== 'all' && !g.byStatus[filter].length) filter = 'all';
      const shown = filter === 'all' ? g.pins : g.byStatus[filter];
      const chip = (id, label, n) => h('button', { 'aria-pressed': String(filter === id), onclick: () => { filter = id; open(); } }, `${label} ${n}`);
      body.push(h('h3', {}, `Pins · ${g.pins.length}`),
        h('div', { class: 'seg wide' }, chip('all', 'All', g.pins.length), ...STATUS_ORDER.map(s => chip(s, PIN_STATUS[s].label, g.byStatus[s].length))),
        h('div', { class: 'rows' }, shown.map(m => row(
          h('span', { class: 'row-n pin-dot', style: `--c:${pinColour(m)}` }, String(m.n)), firstLine(m.note), m,
          h('span', { class: 'row-ic' }, statusOf(m) === 'open' ? '' : PIN_STATUS[statusOf(m)].label, photosOf(m).length ? h('span', { html: icon('camera', 18) }) : null)))));
    }
    if (g.measures.length) {
      body.push(h('h3', {}, `Measurements · ${g.measures.length}`), h('div', { class: 'rows' }, g.measures.map(m => { const r = measureRow(m); return row(tag(r[0]), `${r[1]}${r[2] ? ` · ${r[2]}` : ''}`, m); })));
    }
    if (g.notes.length) {
      body.push(h('h3', {}, `Notes · ${g.notes.length}`), h('div', { class: 'rows' }, g.notes.map(m => row(tag(TOOL_NAME[m.type]), firstLine(m.text), m))));
    }
    if (g.rest.length) {
      body.push(h('h3', {}, `Other markups · ${g.rest.length}`), h('div', { class: 'rows' }, g.rest.map(m => row(tag(TOOL_NAME[m.type] || m.type), ' ', m))));
    }
    app.ui.openSheet('Markups', body, { wide: true });
  }

  // ---- what goes at the top of a report -------------------------------------
  function details() {
    const r = app.prefs.report, job = app.doc.job;
    const field = (id, label, value, placeholder) => {
      const input = h('input', { type: 'text', id, value: value || '', placeholder: placeholder || '' });
      return [h('div', { class: 'field' }, h('label', { for: id }, label), input), input];
    };
    const [fTitle, title] = field('rep-title', 'Report title', r.title, 'Site report');
    const [fJob, jobNo] = field('rep-job', 'Job number', job.number, 'e.g. ES2621');
    const [fAddr, addr] = field('rep-addr', 'Site address or project', job.address, 'e.g. 45 Example St, Sydney');
    const [fBy, by] = field('rep-by', 'Prepared by', app.prefs.author, 'Your name');
    const [fCo, co] = field('rep-co', 'Company', r.company, '');
    const logoBox = h('div', { class: 'logo-box' });
    const pick = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const paintLogo = () => {
      logoBox.textContent = '';
      logoBox.append(r.logo ? h('img', { src: r.logo, alt: 'Logo' }) : h('span', { class: 'muted' }, 'No logo'),
        h('button', { class: 'btn slim', onclick: () => pick.click() }, r.logo ? 'Change logo' : 'Choose logo'),
        r.logo ? h('button', { class: 'btn slim danger', onclick: () => { r.logo = null; app.savePrefs(); paintLogo(); } }, 'Remove') : null, pick);
    };
    pick.addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        // Kept small: it is stored with the settings and goes into every report.
        const bmp = await createImageBitmap(f), s = Math.min(1, 600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * s)); c.height = Math.max(1, Math.round(bmp.height * s));
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        Object.assign(r, { logo: c.toDataURL('image/png'), logoW: c.width, logoH: c.height });
        app.savePrefs();
        paintLogo();
      } catch (err) { console.error(err); app.ui.toast('That picture would not open'); }
    });
    paintLogo();
    const save = () => {
      r.title = title.value.trim() || 'Site report'; r.company = co.value.trim();
      app.prefs.author = by.value.trim();
      job.number = jobNo.value.trim(); job.address = addr.value.trim();
      app.savePrefs();
      app.saveSoon();
    };
    app.ui.openSheet('Report details', [
      h('p', { class: 'muted' }, 'These go at the top of the site report. Job number and address are kept with this drawing; the rest is the same for every report.'),
      fTitle, fJob, fAddr, fBy, fCo, h('div', { class: 'field' }, h('label', {}, 'Logo'), logoBox),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { save(); open(); } }, 'Done')),
    ], { onClose: save });
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
      const g = gather(), r = app.prefs.report, job = app.doc.job;
      const drawing = app.doc.name.replace(/\.pdf$/i, '');
      const when = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
      await assets.load(g.pins.flatMap(photosOf));
      const snaps = new Map();
      if (kind !== 'xlsx' && g.pins.length) {
        const pdf = await app.loadPdfjs(await app.buildPdf({ flatten: true, photoPages: false }));
        try { for (const m of g.pins) snaps.set(m.id, await snapshot(pdf, m)); } finally { app.closePdf(pdf); }
      }
      const photos = g.pins.reduce((n, m) => n + photosOf(m).filter(id => assets.get(id)).length, 0);
      const plural = (n, w) => `${n} ${n === 1 ? w : `${w}s`}`;
      const summary = [
        g.pins.length ? `${plural(g.pins.length, 'pin')} (${STATUS_ORDER.filter(s => g.byStatus[s].length).map(s => `${g.byStatus[s].length} ${PIN_STATUS[s].label.toLowerCase()}`).join(', ')})` : '0 pins',
        plural(photos, 'photo'), plural(g.stamps.length, 'symbol'), plural(g.measures.length, 'measurement'),
      ].join(' · ');
      const head = [
        ['Drawing', drawing], ['Job number', job.number], ['Site', job.address], ['Date', when], ['Prepared by', app.prefs.author], ['Company', r.company],
      ].filter(x => x[1]);
      const logo = r.logo ? { bytes: dataUrlBytes(r.logo), mime: 'image/png', w: r.logoW || 300, h: r.logoH || 100 } : null;
      const data = { g, title: r.title || 'Site report', head, logo, snaps, summary };
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

  const countRows = g => g.counts.map(c => [c.name, c.kind === 'Counted' ? 'Counted on the drawing' : 'Symbol placed', c.total, pagesText(c)]);
  const measureRows = g => g.measures.map(m => { const r = measureRow(m); return [r[0], `${r[1]}${r[2] ? ` (${r[2]})` : ''}`, m.page + 1]; });
  const noteRows = g => g.notes.map(m => [m.page + 1, TOOL_NAME[m.type], m.text]);
  const picsOf = (m, snaps) => [snaps.get(m.id), ...photosOf(m).map(id => assets.get(id))].filter(Boolean);

  // ---- Word ---------------------------------------------------------------
  function word({ g, title, head, logo, snaps, summary }) {
    const b = [];
    if (logo) b.push({ img: logo, width: Math.min(5, (2.2 * logo.w) / logo.h) });
    b.push({ h: title, level: 0 }, { table: head.map(([k, v]) => [{ p: k, muted: true }, v]), widths: [3.5, 13] }, { p: summary });
    for (const s of STATUS_ORDER) {
      const list = g.byStatus[s];
      if (!list.length) continue;
      b.push({ h: `${PIN_STATUS[s].label} · ${list.length}`, level: 1 });
      for (const m of list) {
        b.push({ h: `${m.n}. ${firstLine(m.note) || 'No note'}`, level: 2 });
        b.push({ p: `Page ${m.page + 1} · ${statusLine(m)}${restOf(m.note) ? `\n${restOf(m.note)}` : ''}`, muted: !restOf(m.note) });
        const pics = picsOf(m, snaps);
        for (let i = 0; i < pics.length; i += 2) {
          const pair = pics.slice(i, i + 2).map(p => ({ img: p, width: p.w >= p.h ? 8 : 5.2 }));
          b.push(pair.length === 2 ? { table: [pair], widths: [8.4, 8.4] } : { img: pair[0].img, width: 9 });
        }
      }
    }
    if (g.counts.length) b.push({ h: 'Counts', level: 1 }, { table: [['Item', 'How', 'Count', 'Where'], ...countRows(g)], header: true, widths: [6.5, 4, 2, 4] });
    if (g.measures.length) b.push({ h: 'Measurements', level: 1 }, { table: [['Type', 'Value', 'Page'], ...measureRows(g)], header: true, widths: [5, 9, 2.5] });
    if (g.notes.length) b.push({ h: 'Notes on the drawing', level: 1 }, { table: [['Page', 'Markup', 'Note'], ...noteRows(g)], header: true, widths: [2, 3, 11.5] });
    return docx(b, { title, author: app.prefs.author || 'Redline' });
  }

  // ---- Excel --------------------------------------------------------------
  function excel({ g, head }) {
    const pages = [...new Set([...g.stamps, ...g.tallies].map(m => m.page))].sort((a, b) => a - b);
    return xlsx([
      { name: 'Pins', widths: [6, 14, 14, 6, 60, 8], rows: [['No', 'Status', 'Status date', 'Page', 'Note', 'Photos'], ...g.pins.map(m => [m.n, PIN_STATUS[statusOf(m)].label, m.statusAt && statusOf(m) !== 'open' ? day(m.statusAt) : '', m.page + 1, m.note || '', photosOf(m).length])] },
      { name: 'Counts', widths: [36, 22, 8, ...pages.map(() => 9)], rows: [['Item', 'How', 'Total', ...pages.map(p => `Page ${p + 1}`)], ...g.counts.map(c => [c.name, c.kind === 'Counted' ? 'Counted on the drawing' : 'Symbol placed', c.total, ...pages.map(p => c.pages.get(p) || 0)])] },
      { name: 'Measurements', widths: [10, 12, 8, 14, 6], rows: [['Type', 'Value', 'Unit', 'Perimeter (m)', 'Page'], ...g.measures.map(m => { const q = measureOf(m); return m.type === 'area' ? ['Area', Math.round(q.area * 1000) / 1000, 'm²', Math.round(q.length * 1000) / 1000, m.page + 1] : [m.type === 'path' ? 'Run' : 'Length', Math.round(q.length * 1000) / 1000, 'm', '', m.page + 1]; })] },
      { name: 'Notes', widths: [6, 12, 80], rows: [['Page', 'Markup', 'Note'], ...noteRows(g)] },
      { name: 'Details', widths: [16, 60], rows: [['Detail', 'Value'], ...head] },
    ]);
  }

  // ---- PDF ----------------------------------------------------------------
  async function pdfReport({ g, title, head, logo, snaps, summary }) {
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
        for (const wd of para.split(' ')) {
          const cand = cur ? `${cur} ${wd}` : wd;
          if (f.widthOfTextAtSize(cand, size) <= width || !cur) cur = cand; else { out.push(cur); cur = wd; }
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
    const table = (rows, widths, header = true) => {
      const total = widths.reduce((a, b) => a + b, 0), ws = widths.map(w => (w / total) * (W - 2 * M));
      rows.forEach((r, ri) => {
        const f = header && ri === 0 ? bold : reg, cells = r.map((c, ci) => wrapWith(f, String(c ?? ''), 9.5, ws[ci] - 8));
        const hh = Math.max(...cells.map(c => c.length)) * 12 + 6;
        room(hh);
        if (header && ri === 0) page.drawRectangle({ x: M, y: y - hh, width: W - 2 * M, height: hh, color: PDFLib.rgb(0.93, 0.945, 0.96) });
        let cx = M;
        cells.forEach((lines, ci) => { lines.forEach((ln, k) => { if (ln) page.drawText(ln, { x: cx + 4, y: y - 13 - k * 12, size: 9.5, font: f, color: ink }); }); cx += ws[ci]; });
        y -= hh;
        page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: line });
      });
      y -= 10;
    };
    const cache = new Map();
    const embed = async im => { if (!cache.has(im)) cache.set(im, await (im.mime === 'image/png' ? pdf.embedPng(im.bytes) : pdf.embedJpg(im.bytes))); return cache.get(im); };

    if (logo) {
      const lh = Math.min(54, (150 * logo.h) / logo.w), lw = (lh * logo.w) / logo.h;
      page.drawImage(await embed(logo), { x: W - M - lw, y: H - M - lh, width: lw, height: lh });
    }
    text(title, { size: 24, f: bold, gap: 6, width: W - 2 * M - 170 });
    table(head, [3, 13], false);
    text(summary, { gap: 8 });

    const colW = (W - 2 * M - 12) / 2;
    const hOf = p => Math.min((colW * p.h) / p.w, 260);
    const firstBlock = m => { const pics = picsOf(m, snaps); return 44 + (pics.length ? Math.max(...pics.slice(0, 2).map(hOf)) : 0); };
    for (const s of STATUS_ORDER) {
      const list = g.byStatus[s];
      if (!list.length) continue;
      room(50 + firstBlock(list[0]));                     // a heading never sits alone at the foot of a page
      heading(`${PIN_STATUS[s].label} · ${list.length}`, 15);
      for (const m of list) {
        const pics = picsOf(m, snaps);
        room(firstBlock(m));
        text(`${m.n}. ${firstLine(m.note) || 'No note'}`, { size: 12, f: bold, gap: 1 });
        if (restOf(m.note)) text(restOf(m.note), { gap: 1 });
        text(`Page ${m.page + 1} · ${statusLine(m)}`, { size: 9.5, color: grey, gap: 5 });
        for (let i = 0; i < pics.length; i += 2) {
          const pair = pics.slice(i, i + 2), rowH = Math.max(...pair.map(hOf));
          room(rowH + 10);
          for (let k = 0; k < pair.length; k++) {
            const p = pair[k], ph = hOf(p), pw = Math.min(colW, (ph * p.w) / p.h);
            page.drawImage(await embed(p), { x: M + k * (colW + 12), y: y - ph, width: pw, height: ph });
          }
          y -= rowH + 10;
        }
        y -= 4;
      }
    }
    if (g.counts.length) { heading('Counts', 15); table([['Item', 'How', 'Count', 'Where'], ...countRows(g)], [7, 4.5, 2, 4]); }
    if (g.measures.length) { heading('Measurements', 15); table([['Type', 'Value', 'Page'], ...measureRows(g)], [4, 9, 2]); }
    if (g.notes.length) { heading('Notes on the drawing', 15); table([['Page', 'Markup', 'Note'], ...noteRows(g)], [1.5, 3, 12]); }
    return pdf.save();
  }

  app.report = { open, gather, details };
}
