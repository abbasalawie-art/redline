// Writes markups into a PDF (as real, editable PDF markups, or flattened into the page)
// and reads Redline's own markups back out of a PDF it saved earlier.
// No DOM in here: it runs the same in the browser and in Node tests.
import { buildShapes, SUBJECT, textPad } from './shapes.js';
import { LINE_HEIGHT } from './text.js';

const DATA_KEY = 'RedlineData';   // on the main markup: the full Redline record (JSON)
const PART_KEY = 'RedlinePart';   // on a companion markup (the cloud of a cloud + text)

const LE_NAME = { none: 'None', closed: 'ClosedArrow', open: 'OpenArrow', dot: 'Circle' };

const num = v => { const r = Math.round(v * 100) / 100; return r === 0 ? '0' : String(r); };
const num4 = v => { const r = Math.round(v * 10000) / 10000; return r === 0 ? '0' : String(r); };
// Rounded up a hair, so readers that truncate when converting back to 0-255 (Revu does) get the same colour.
const rgb = h => [1, 3, 5].map(i => Math.min(1, Math.ceil((parseInt(h.slice(i, i + 2), 16) / 255) * 1e5) / 1e5));
const rgbOps = h => rgb(h).join(' ');

/** Matrix that takes page view coordinates (top-left origin, y down, rotation applied) to PDF space. */
export function viewToPdfMatrix(rotation, box) {
  const { x, y, width: w, height: h } = box;
  switch (((rotation % 360) + 360) % 360) {
    case 90: return [0, 1, 1, 0, x, y];
    case 180: return [-1, 0, 0, 1, x + w, y];
    case 270: return [0, -1, -1, 0, x + w, y + h];
    default: return [1, 0, 0, -1, x, y + h];
  }
}

const tp = (M, x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];

function pdfRect(M, r) {
  const a = tp(M, r.x, r.y), b = tp(M, r.x + r.w, r.y + r.h);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])].map(v => Math.round(v * 100) / 100);
}

function pdfDate(d) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const off = -d.getTimezoneOffset(), s = off < 0 ? '-' : '+', a = Math.abs(off);
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}'${p(a % 60)}'`;
}

/** Content-stream operators for a list of shape items (drawn in view coordinates). */
function content(items, font, gsName) {
  let s = '';
  for (const it of items) {
    s += 'q\n';
    if (it.opacity < 1 || it.blend) s += `/${gsName(it.opacity, it.blend)} gs\n`;
    if (it.t === 'path') {
      if (it.stroke) s += `${rgbOps(it.stroke)} RG ${num(it.w)} w ${it.cap === 'round' ? 1 : 0} J ${it.join === 'round' ? 1 : 0} j\n`;
      if (it.fill) s += `${rgbOps(it.fill)} rg\n`;
      for (const c of it.d) {
        if (c[0] === 'M') s += `${num(c[1])} ${num(c[2])} m\n`;
        else if (c[0] === 'L') s += `${num(c[1])} ${num(c[2])} l\n`;
        else if (c[0] === 'C') s += `${num(c[1])} ${num(c[2])} ${num(c[3])} ${num(c[4])} ${num(c[5])} ${num(c[6])} c\n`;
        else s += 'h\n';
      }
      s += it.fill && it.stroke ? 'B\n' : it.fill ? 'f\n' : 'S\n';
    } else {
      s += `BT\n/Helv ${num(it.size)} Tf\n${rgbOps(it.color)} rg\n`;
      for (const ln of it.lines) if (ln.s) s += `1 0 0 -1 ${num(ln.x)} ${num(ln.y)} Tm\n${font.hex(ln.s)} Tj\n`;
      s += 'ET\n';
    }
    s += 'Q\n';
  }
  return s;
}

async function loadDoc(PDFLib, bytes, password) {
  try {
    return await PDFLib.PDFDocument.load(bytes, { updateMetadata: false });
  } catch (e) {
    if (!/encrypt/i.test(String(e && e.message))) throw e;
    // "Secured" PDFs usually open without a password: unlock with the empty one unless one was given.
    const doc = await PDFLib.PDFDocument.load(bytes, { updateMetadata: false, password: password || '' });
    delete doc.context.trailerInfo.Encrypt;
    doc.wasSecured = true;
    return doc;
  }
}

const roundJson = (k, v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

/**
 * opts: { font, author, flatten, matrices, password }
 *   font      from text.js makeFont()
 *   matrices  optional per-page view→PDF matrices (from the viewer); worked out from the page if absent
 */
export async function exportPdf(PDFLib, baseBytes, markups, opts = {}) {
  const { PDFString, PDFHexString } = PDFLib;
  const { font, author = 'Redline', flatten = false, matrices = null, password } = opts;
  const doc = await loadDoc(PDFLib, baseBytes, password);
  const ctx = doc.context;
  const pages = doc.getPages();
  const helv = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' }));
  const gsRefs = new Map();
  const date = pdfDate(new Date());

  for (const m of markups) {
    const page = pages[m.page];
    if (!page) continue;
    const M = (matrices && matrices[m.page]) || viewToPdfMatrix(page.getRotation().angle, page.getCropBox());
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const shapes = buildShapes(m, font);
    const refs = shapes.parts.map(() => ctx.nextRef());
    const mainIdx = shapes.parts.length - 1;

    shapes.parts.forEach((part, pi) => {
      const lw = m.width;
      // Square / Circle: the markup's rectangle is the outer edge of the line.
      const box = part.kind === 'rect' || part.kind === 'ellipse'
        ? { x: part.rect.x - lw / 2, y: part.rect.y - lw / 2, w: part.rect.w + lw, h: part.rect.h + lw }
        : part.bbox;
      const rect = pdfRect(M, box);

      const gs = {};
      const body = content(part.items, font, (opacity, blend) => {
        const key = `${opacity}|${blend || ''}`;
        if (!gsRefs.has(key)) {
          const d = { Type: 'ExtGState', CA: opacity, ca: opacity };
          if (blend) d.BM = 'Multiply';
          gsRefs.set(key, { name: `GS${gsRefs.size}`, ref: ctx.register(ctx.obj(d)) });
        }
        const g = gsRefs.get(key);
        gs[g.name] = g.ref;
        return g.name;
      });
      const resources = { Font: { Helv: helv } };
      if (Object.keys(gs).length) resources.ExtGState = gs;
      const ap = ctx.register(ctx.flateStream(`q\n${M.map(num4).join(' ')} cm\n${body}Q\n`, {
        Type: 'XObject', Subtype: 'Form', FormType: 1, BBox: rect, Resources: resources,
      }));

      if (flatten) {
        page.node.normalize();
        const name = page.node.newXObject('Rl', ap);
        page.pushOperators(PDFLib.pushGraphicsState(), PDFLib.drawObject(name), PDFLib.popGraphicsState());
        return;
      }

      const isMain = pi === mainIdx;
      const d = {
        Type: 'Annot', Rect: rect, P: page.ref, F: 4,
        NM: PDFString.of(isMain ? m.id : `${m.id}-${pi}`),
        T: PDFHexString.fromText(author),
        M: PDFString.of(date), CreationDate: PDFString.of(date),
        C: rgb(m.color), AP: { N: ap },
      };
      if (m.opacity < 1) d.CA = m.opacity;
      const bs = { W: lw, S: 'S' };
      let subject = SUBJECT[m.type];

      if (part.kind === 'cloud') {
        d.Subtype = 'Polygon';
        d.Vertices = [[0, 0], [1, 0], [1, 1], [0, 1]].flatMap(([i, j]) => tp(M, part.rect.x + i * part.rect.w, part.rect.y + j * part.rect.h)).map(v => Math.round(v * 100) / 100);
        d.BS = bs; d.BE = { S: 'C', I: 2 }; d.IT = 'PolygonCloud';
        if (m.fill) { d.IC = rgb(m.fill); d.FillOpacity = m.fillOpacity ?? 1; }
        if (!isMain) { subject = 'Cloud'; d.IRT = refs[mainIdx]; d.RT = 'Group'; }
      } else if (part.kind === 'rect' || part.kind === 'ellipse') {
        d.Subtype = part.kind === 'rect' ? 'Square' : 'Circle';
        d.BS = bs;
        if (m.fill) { d.IC = rgb(m.fill); d.FillOpacity = m.fillOpacity ?? 1; }
      } else if (part.kind === 'line') {
        d.Subtype = 'Line';
        d.L = [...tp(M, part.p1.x, part.p1.y), ...tp(M, part.p2.x, part.p2.y)].map(v => Math.round(v * 100) / 100);
        d.LE = ['None', LE_NAME[part.head]];
        d.BS = bs;
        if (part.head === 'closed' || part.head === 'dot') d.IC = rgb(m.color);
        if (part.head !== 'none') d.IT = 'LineArrow'; else subject = 'Line';
      } else if (part.kind === 'ink') {
        d.Subtype = 'Ink';
        d.InkList = [part.pts.flatMap(p => tp(M, p[0], p[1])).map(v => Math.round(v * 100) / 100)];
        d.BS = bs;
        if (part.highlight) d.BM = 'Multiply';
      } else if (part.kind === 'freetext') {
        const tb = part.textBox;
        const tbRect = pdfRect(M, tb);
        d.Subtype = 'FreeText';
        d.Contents = PDFHexString.fromText(font.clean(m.text || ''));
        // Revu and Acrobat read the line colour from DA and the text colour from DS.
        d.DA = PDFString.of(`${rgbOps(m.color)} rg /Helv ${num(m.fontSize)} Tf`);
        const style = `font:Helvetica ${num(m.fontSize)}pt; text-align:left; margin:${num(textPad(m))}pt; line-height:${num(m.fontSize * LINE_HEIGHT)}pt; color:${m.textColor.toUpperCase()}`;
        d.DS = PDFString.of(style);
        // Revu takes the text colour from the rich-text version of the note.
        const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const paras = font.clean(m.text || '').split('\n').map(t => `<p>${esc(t)}</p>`).join('');
        d.RC = PDFHexString.fromText(`<?xml version="1.0"?><body xmlns:xfa="http://www.xfa.org/schema/xfa-data/1.0/" xfa:contentType="text/html" xfa:APIVersion="BluebeamPDFRevu:2018" xfa:spec="2.2.0" style="${style}" xmlns="http://www.w3.org/1999/xhtml">${paras}</body>`);
        d.Q = 0;
        d.BS = { W: m.border ? lw : 0, S: 'S' };
        d.RD = [tbRect[0] - rect[0], tbRect[1] - rect[1], rect[2] - tbRect[2], rect[3] - tbRect[3]].map(v => Math.max(0, Math.round(v * 100) / 100));
        if (rotation) d.Rotate = rotation;
        delete d.C;                                   // on FreeText, C is the box fill
        if (m.fill && m.type !== 'cloudplus') d.C = rgb(m.fill);
        if (part.callout && part.leader) {
          d.IT = 'FreeTextCallout';
          d.CL = part.leader.flatMap(p => tp(M, p.x, p.y)).map(v => Math.round(v * 100) / 100);
          d.LE = LE_NAME[part.head];
        } else if (!m.border) {
          d.IT = 'FreeTextTypeWriter';
        }
      }
      d.Subj = PDFString.of(subject);
      if (isMain) {
        const record = { v: 1, m, fp: { d: date, r: rect } };
        d[DATA_KEY] = PDFHexString.fromText(JSON.stringify(record, roundJson));
      } else {
        d[PART_KEY] = PDFString.of(m.id);
      }
      ctx.assign(refs[pi], ctx.obj(d));
      page.node.addAnnot(refs[pi]);
    });
  }
  return doc.save();
}

/**
 * Pull Redline's own markups out of a PDF so they can be edited again.
 * Returns { baseBytes, markups, writable, secured, error }:
 *   baseBytes  the PDF without those markups (what the viewer draws underneath)
 *   writable   false if the file cannot be written to (viewing still works)
 *   secured    true if the author locked the PDF against changes (the export will be an unlocked copy)
 */
export async function importPdf(PDFLib, bytes, password) {
  const { PDFName, PDFDict, PDFString, PDFHexString, PDFRef } = PDFLib;
  let doc;
  try {
    doc = await loadDoc(PDFLib, bytes, password);
  } catch (e) {
    return { baseBytes: bytes, markups: [], writable: false, error: String((e && e.message) || e) };
  }
  const pages = doc.getPages();
  const found = [], ids = new Set(), owner = new Map();
  const textOf = (d, key) => {
    const v = d.lookupMaybe(PDFName.of(key), PDFString, PDFHexString);
    return v ? v.decodeText() : null;
  };

  pages.forEach((page, pageIdx) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const d = annots.lookupMaybe(i, PDFDict);
      if (!d) continue;
      const part = textOf(d, PART_KEY);
      if (part) { owner.set(d, part); continue; }
      const raw = textOf(d, DATA_KEY);
      if (!raw) continue;
      try {
        const rec = JSON.parse(raw);
        // Only take it back if nothing else has touched it since we wrote it.
        const rect = d.lookup(PDFName.of('Rect')).asArray().map(n => n.asNumber());
        const same = textOf(d, 'M') === rec.fp.d && rect.every((v, k) => Math.abs(v - rec.fp.r[k]) < 0.5);
        if (!same || !rec.m || !rec.m.id) continue;
        found.push({ ...rec.m, page: pageIdx });
        ids.add(rec.m.id);
        owner.set(d, rec.m.id);
      } catch { /* not ours, or damaged: leave it alone */ }
    }
  });
  const secured = !!doc.wasSecured;
  if (!found.length) return { baseBytes: bytes, markups: [], writable: true, secured };

  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const d = annots.lookupMaybe(i, PDFDict);
      if (!d || !ids.has(owner.get(d))) continue;
      const ref = annots.get(i);
      const ap = d.lookupMaybe(PDFName.of('AP'), PDFDict);
      const n = ap && ap.get(PDFName.of('N'));
      if (n instanceof PDFRef) doc.context.delete(n);
      annots.remove(i);
      if (ref instanceof PDFRef) doc.context.delete(ref);
    }
  }
  return { baseBytes: await doc.save(), markups: found, writable: true, secured };
}
