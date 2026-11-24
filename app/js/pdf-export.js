// Writes markups into a PDF (as real, editable PDF markups, or flattened into the page)
// and reads Redline's own markups back out of a PDF it saved earlier.
// No DOM in here: it runs the same in the browser and in Node tests.
import { buildShapes, SUBJECT, textPad, photosOf, statusOf, pinColour, PIN_STATUS } from './shapes.js';
import { LINE_HEIGHT } from './text.js';

const DATA_KEY = 'RedlineData';     // on the main markup: the full Redline record (JSON)
const PART_KEY = 'RedlinePart';     // on a companion markup (the cloud of a cloud + text)
const ASSETS_KEY = 'RedlineAssets'; // in the catalog: the pictures and symbols the markups use
const PAGE_KEY = 'RedlinePage';     // on a page Redline added (photo pages)

const LE_NAME = { none: 'None', closed: 'ClosedArrow', open: 'OpenArrow', dot: 'Circle' };

const num = v => { const r = Math.round(v * 100) / 100; return r === 0 ? '0' : String(r); };
const num4 = v => { const r = Math.round(v * 10000) / 10000; return r === 0 ? '0' : String(r); };
const r2 = v => Math.round(v * 100) / 100;
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
/** Two matrices as one: mul(A, B) applies B first, then A. */
const mul = (A, B) => [
  A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
  A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];

function pdfRect(M, r) {
  const a = tp(M, r.x, r.y), b = tp(M, r.x + r.w, r.y + r.h);
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])].map(r2);
}

function pdfDate(d) {
  const p = (n, l = 2) => String(n).padStart(l, '0');
  const off = -d.getTimezoneOffset(), s = off < 0 ? '-' : '+', a = Math.abs(off);
  return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${s}${p(Math.floor(a / 60))}'${p(a % 60)}'`;
}

/** Content-stream operators for a list of shape items (drawn in view coordinates). */
function content(items, font, gsName, picName) {
  let s = '';
  for (const it of items) {
    if (it.t === 'image') {
      const name = picName(it);
      if (!name) continue;
      // The picture's unit square (y up) onto its rectangle on the page (y down), then turned about its centre.
      const a = (it.rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a), cx = it.x + it.w / 2, cy = it.y + it.h / 2;
      const R = [cs, sn, -sn, cs, cx - cx * cs + cy * sn, cy - cx * sn - cy * cs];
      const gs = it.opacity < 1 ? `/${gsName(it.opacity, null)} gs\n` : '';
      s += `q\n${gs}${mul(R, [it.w, 0, 0, -it.h, it.x, it.y + it.h]).map(num4).join(' ')} cm\n/${name} Do\nQ\n`;
      continue;
    }
    s += 'q\n';
    if (it.opacity < 1 || it.blend) s += `/${gsName(it.opacity, it.blend)} gs\n`;
    if (it.t === 'path') {
      if (it.stroke) s += `${rgbOps(it.stroke)} RG ${num(it.w)} w ${it.cap === 'round' ? 1 : 0} J ${it.join === 'round' ? 1 : 0} j\n`;
      if (it.stroke && it.dash) s += `[${it.dash.map(num).join(' ')}] 0 d\n`;
      if (it.fill) s += `${rgbOps(it.fill)} rg\n`;
      for (const c of it.d) {
        if (c[0] === 'M') s += `${num(c[1])} ${num(c[2])} m\n`;
        else if (c[0] === 'L') s += `${num(c[1])} ${num(c[2])} l\n`;
        else if (c[0] === 'C') s += `${num(c[1])} ${num(c[2])} ${num(c[3])} ${num(c[4])} ${num(c[5])} ${num(c[6])} c\n`;
        else s += 'h\n';
      }
      const eo = it.eo ? '*' : '';
      s += it.fill && it.stroke ? `B${eo}\n` : it.fill ? `f${eo}\n` : 'S\n';
    } else {
      s += `BT\n/Helv ${num(it.size)} Tf\n${rgbOps(it.color)} rg\n`;
      let R = null;
      if (it.rot) {
        const a = (it.rot * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
        R = [cs, sn, -sn, cs, it.cx - it.cx * cs + it.cy * sn, it.cy - it.cx * sn - it.cy * cs];
      }
      for (const ln of it.lines) {
        if (!ln.s) continue;
        const tm = R ? mul(R, [1, 0, 0, -1, ln.x, ln.y]).map(num4).join(' ') : `1 0 0 -1 ${num(ln.x)} ${num(ln.y)}`;
        s += `${tm} Tm\n${font.hex(ln.s)} Tj\n`;
      }
      s += 'ET\n';
    }
    s += 'Q\n';
  }
  return s;
}

export async function loadDoc(PDFLib, bytes, password) {
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

// Coordinates are kept to a hundredth of a point. The drawing scale (mpp) is a small number that must stay exact.
const roundJson = (k, v) => (typeof v === 'number' && k !== 'mpp' ? Math.round(v * 100) / 100 : v);
const utf8 = s => new TextEncoder().encode(s);

/** Write the form answers into the PDF's own fields. */
function fillForm(PDFLib, doc, values, font, flatten) {
  let form;
  try { form = doc.getForm(); } catch { return; }
  for (const [name, v] of Object.entries(values || {})) {
    try {
      const f = form.getField(name);
      if (f instanceof PDFLib.PDFTextField) {
        const text = v == null || v === '' ? '' : font.clean(String(v));
        if (text && f.isMultiline()) {
          // Left to itself the lettering grows to fill the box. Keep it at a reading size, smaller only if it must be to fit.
          const w = f.acroField.getWidgets()[0], r = w && w.getRectangle();
          if (r) {
            let size = 12;
            while (size > 6 && font.wrap(text, size, Math.max(size, r.width - 6)).length * size * 1.2 + 6 > r.height) size -= 0.5;
            f.setFontSize(size);
          }
        }
        f.setText(text || undefined);
      }
      else if (f instanceof PDFLib.PDFCheckBox) { if (v) f.check(); else f.uncheck(); }
      else if (f instanceof PDFLib.PDFRadioGroup) { if (v) f.select(String(v)); else f.clear(); }
      else if (f instanceof PDFLib.PDFDropdown || f instanceof PDFLib.PDFOptionList) { if (v) f.select(String(v)); else f.clear(); }
    } catch (e) { console.warn('form field not written:', name, e && e.message); }
  }
  if (flatten) { try { form.flatten(); } catch (e) { console.warn('form not flattened', e && e.message); } }
}

/**
 * opts: { font, author, flatten, matrices, password, assets, form, photoPages, title, docId }
 *   font        from text.js makeFont()
 *   matrices    optional per-page view→PDF matrices (from the viewer); worked out from the page if absent
 *   assets      get(id) → { id, kind: 'vec' | 'img', w, h, items | bytes + mime, alpha }
 *   form        { fieldName: value } answers typed into the PDF's form fields
 *   photoPages  add a page at the back for each pin's photo (default true)
 *   docId       the drawing's identity (hex); written as the PDF's ID if the file has none, so later saves stay recognisable
 */
export async function exportPdf(PDFLib, baseBytes, markups, opts = {}) {
  const { PDFString, PDFHexString, PDFName } = PDFLib;
  const { font, author = 'Redline', flatten = false, matrices = null, password, assets = null, form = null, photoPages = true, title = '', docId = null } = opts;
  const doc = await loadDoc(PDFLib, baseBytes, password);
  const ctx = doc.context;
  if (docId && /^[0-9a-f]{8,}$/i.test(docId) && !ctx.trailerInfo.ID) ctx.trailerInfo.ID = ctx.obj([PDFHexString.of(docId), PDFHexString.of(docId)]);
  const pages = doc.getPages();
  const helv = ctx.register(ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' }));
  const gsRefs = new Map();
  const date = pdfDate(new Date());
  const asset = id => (assets && id ? assets.get(id) : null) || null;

  if (form && Object.keys(form).length) fillForm(PDFLib, doc, form, font, flatten);

  // Pictures first: embedding is the one step that has to wait.
  const pics = new Map();           // asset id → { ref, mask }
  const tints = new Map();          // "id|#colour" → ref
  const used = new Map();           // asset id → asset (everything the markups lean on)
  for (const m of markups) {
    if (!pages[m.page]) continue;
    for (const id of [m.type === 'stamp' ? m.sym : null, ...(m.type === 'pin' ? photosOf(m) : [])]) {
      const a = asset(id);
      if (a) used.set(id, a);
    }
  }
  const embedPic = async a => {
    if (pics.has(a.id)) return pics.get(a.id);
    const img = a.mime === 'image/jpeg' ? await doc.embedJpg(a.bytes) : await doc.embedPng(a.bytes);
    await img.embed();
    const dict = ctx.lookup(img.ref).dict;
    const rec = { ref: img.ref, mask: dict.get(PDFName.of('SMask')) || null, img };
    pics.set(a.id, rec);
    return rec;
  };
  for (const m of markups) {
    const a = m.type === 'stamp' ? used.get(m.sym) : null;
    if (a && a.kind === 'img') { try { await embedPic(a); } catch (e) { console.warn('picture not embedded', e && e.message); } }
  }

  for (const m of markups) {
    const page = pages[m.page];
    if (!page) continue;
    const M = (matrices && matrices[m.page]) || viewToPdfMatrix(page.getRotation().angle, page.getCropBox());
    const rotation = ((page.getRotation().angle % 360) + 360) % 360;
    const shapes = buildShapes(m, font, assets);
    const refs = shapes.parts.map(() => ctx.nextRef());
    const mainIdx = shapes.parts.length - 1;
    const colour = m.type === 'pin' ? pinColour(m) : m.color || m.tint || '#000000';

    shapes.parts.forEach((part, pi) => {
      const lw = m.width || 0;
      // Square / Circle: the markup's rectangle is the outer edge of the line.
      const box = part.kind === 'rect' || part.kind === 'ellipse'
        ? { x: part.rect.x - lw / 2, y: part.rect.y - lw / 2, w: part.rect.w + lw, h: part.rect.h + lw }
        : part.bbox;
      const rect = pdfRect(M, box);

      const gs = {}, xo = {};
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
      }, it => {
        const pic = pics.get(it.asset);
        if (!pic) return null;
        let ref = pic.ref;
        if (it.tint && pic.mask) {
          // One colour, cut to the picture's own shape: a single pixel wearing the picture's transparency.
          const key = `${it.asset}|${it.tint}`;
          if (!tints.has(key)) {
            tints.set(key, ctx.register(ctx.stream(Uint8Array.from(rgb(it.tint).map(v => Math.round(v * 255))), {
              Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, SMask: pic.mask,
            })));
          }
          ref = tints.get(key);
        }
        const name = `Im${ref.objectNumber}`;
        xo[name] = ref;
        return name;
      });
      const resources = { Font: { Helv: helv } };
      if (Object.keys(gs).length) resources.ExtGState = gs;
      if (Object.keys(xo).length) resources.XObject = xo;
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
        C: rgb(colour), AP: { N: ap },
      };
      if (m.opacity < 1) d.CA = m.opacity;
      const bs = { W: lw, S: 'S' };
      const verts = pts => pts.flatMap(p => tp(M, p[0], p[1])).map(r2);
      let subject = SUBJECT[m.type];

      if (part.kind === 'cloud') {
        d.Subtype = 'Polygon';
        d.Vertices = part.poly.flatMap(p => tp(M, p.x, p.y)).map(r2);
        d.BS = bs; d.BE = { S: 'C', I: 2 }; d.IT = 'PolygonCloud';
        if (m.fill) { d.IC = rgb(m.fill); d.FillOpacity = m.fillOpacity ?? 1; }
        if (!isMain) { subject = 'Cloud'; d.IRT = refs[mainIdx]; d.RT = 'Group'; }
      } else if (part.kind === 'rect' || part.kind === 'ellipse') {
        d.Subtype = part.kind === 'rect' ? 'Square' : 'Circle';
        d.BS = bs;
        if (m.fill) { d.IC = rgb(m.fill); d.FillOpacity = m.fillOpacity ?? 1; }
      } else if (part.kind === 'line') {
        d.Subtype = 'Line';
        d.L = [...tp(M, part.p1.x, part.p1.y), ...tp(M, part.p2.x, part.p2.y)].map(r2);
        d.LE = ['None', LE_NAME[part.head]];
        d.BS = bs;
        if (part.head === 'closed' || part.head === 'dot') d.IC = rgb(colour);
        if (part.measure) d.Contents = PDFHexString.fromText(part.measure);
        else if (part.head !== 'none') d.IT = 'LineArrow'; else subject = 'Line';
      } else if (part.kind === 'polyline' || part.kind === 'polygon') {
        d.Subtype = part.kind === 'polygon' ? 'Polygon' : 'PolyLine';
        d.Vertices = verts(part.pts);
        d.BS = bs;
        d.Contents = PDFHexString.fromText(part.measure || '');
        if (part.kind === 'polygon') { d.IC = rgb(m.fill || colour); d.FillOpacity = m.fillOpacity ?? 0.15; }
      } else if (part.kind === 'ink') {
        d.Subtype = 'Ink';
        d.InkList = part.strokes.map(verts);
        d.BS = bs;
        if (part.highlight) d.BM = 'Multiply';
      } else if (part.kind === 'stamp' || part.kind === 'pin' || part.kind === 'count') {
        d.Subtype = 'Stamp';
        d.Name = part.kind === 'pin' ? 'Pin' : part.kind === 'count' ? 'Count' : 'Symbol';
        const state = part.kind === 'pin' && statusOf(m) !== 'open' ? ` (${PIN_STATUS[statusOf(m)].label})` : '';
        const note = part.kind === 'pin' ? `${m.n}${state}${m.note ? `: ${m.note}` : ''}` : part.kind === 'count' ? part.total : (m.name || '');
        if (note) d.Contents = PDFHexString.fromText(note);
        if (part.kind === 'stamp' && m.name) subject = m.name;
        if (part.kind === 'count' && m.label) subject = m.label;
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
        d.RD = [tbRect[0] - rect[0], tbRect[1] - rect[1], rect[2] - tbRect[2], rect[3] - tbRect[3]].map(v => Math.max(0, r2(v)));
        if (rotation) d.Rotate = rotation;
        delete d.C;                                   // on FreeText, C is the box fill
        if (m.fill && m.type !== 'cloudplus') d.C = rgb(m.fill);
        if (part.callout && part.leader) {
          d.IT = 'FreeTextCallout';
          d.CL = part.leader.flatMap(p => tp(M, p.x, p.y)).map(r2);
          d.LE = LE_NAME[part.head];
        } else if (!m.border) {
          d.IT = 'FreeTextTypeWriter';
        }
      }
      d.Subj = PDFHexString.fromText(subject);
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

  // A page at the back for each pin's photo, with its number and note.
  const photos = [];
  for (const m of markups.filter(x => x.type === 'pin' && pages[x.page]).sort((a, b) => a.n - b.n)) {
    const ids = photosOf(m).filter(id => used.get(id));
    ids.forEach((id, i) => photos.push({ m, id, part: ids.length > 1 ? ` (${i + 1} of ${ids.length})` : '' }));
  }
  if (photoPages && photos.length) {
    const cap = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
    const ink = PDFLib.rgb(0.08, 0.09, 0.11), grey = PDFLib.rgb(0.37, 0.42, 0.48);
    for (const { m, id, part } of photos) {
      let pic;
      try { pic = await embedPic(used.get(id)); } catch (e) { console.warn('photo not embedded', e && e.message); continue; }
      const a = used.get(id), wide = a.w >= a.h;
      const [W, H] = wide ? [841.89, 595.28] : [595.28, 841.89], mg = 36;
      const pg = doc.addPage([W, H]);
      pg.node.set(PDFName.of(PAGE_KEY), PDFLib.PDFBool.True);
      let y = H - mg - 16;
      const head = `Photo ${m.n}${part}`, state = statusOf(m) !== 'open' ? `  ·  ${PIN_STATUS[statusOf(m)].label}` : '';
      pg.drawText(font.clean(head), { x: mg, y, size: 18, font: cap, color: ink });
      pg.drawText(font.clean(`${title ? `${title}  ·  ` : ''}page ${m.page + 1}${state}`), { x: mg + cap.widthOfTextAtSize(head, 18) + 14, y, size: 11, font: cap, color: grey });
      y -= 8;
      for (const ln of font.wrap(m.note || '', 12, W - 2 * mg).slice(0, 6)) { if (!ln) continue; y -= 15; pg.drawText(ln, { x: mg, y, size: 12, font: cap, color: ink }); }
      y -= 12;
      const s = Math.min((W - 2 * mg) / a.w, (y - mg) / a.h);
      pg.drawImage(pic.img, { x: (W - a.w * s) / 2, y: y - a.h * s, width: a.w * s, height: a.h * s });
    }
  }

  // Keep what the markups lean on inside the file, so another device can open it and carry on.
  if (!flatten && used.size) {
    const dict = {};
    for (const [id, a] of used) {
      if (a.kind === 'vec') dict[id] = ctx.register(ctx.flateStream(utf8(JSON.stringify({ w: a.w, h: a.h, items: a.items }, roundJson)), { Kind: 'vec' }));
      else if (a.mime === 'image/jpeg' && pics.has(id)) dict[id] = pics.get(id).ref;       // the embedded photo is the JPEG file itself
      else dict[id] = ctx.register(ctx.stream(a.bytes, { Kind: a.mime === 'image/jpeg' ? 'jpg' : 'png', W: a.w, H: a.h }));
    }
    doc.catalog.set(PDFName.of(ASSETS_KEY), ctx.obj(dict));
  }
  return doc.save();
}

/**
 * Pull Redline's own markups out of a PDF so they can be edited again.
 * Returns { baseBytes, markups, assets, writable, secured, error }:
 *   baseBytes  the PDF without those markups and without the photo pages Redline added
 *   assets     pictures and symbols the markups use: [{ id, kind, w, h, items | bytes + mime, alpha }]
 *   writable   false if the file cannot be written to (viewing still works)
 *   secured    true if the author locked the PDF against changes (the export will be an unlocked copy)
 */
export async function importPdf(PDFLib, bytes, password) {
  const { PDFName, PDFDict, PDFString, PDFHexString, PDFRef, PDFRawStream, PDFArray } = PDFLib;
  let doc;
  try {
    doc = await loadDoc(PDFLib, bytes, password);
  } catch (e) {
    return { baseBytes: bytes, markups: [], assets: [], writable: false, error: String((e && e.message) || e) };
  }
  const ctx = doc.context;
  const pages = doc.getPages();
  const found = [], ids = new Set(), owner = new Map();
  const textOf = (d, key) => {
    const v = d.lookupMaybe(PDFName.of(key), PDFString, PDFHexString);
    return v ? v.decodeText() : null;
  };
  const kept = pages.filter(p => !p.node.get(PDFName.of(PAGE_KEY)));     // page numbers as they will be once our photo pages go

  pages.forEach(page => {
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
        const pageIdx = kept.indexOf(page);
        if (!same || !rec.m || !rec.m.id || pageIdx < 0) continue;
        found.push({ ...rec.m, page: pageIdx });
        ids.add(rec.m.id);
        owner.set(d, rec.m.id);
      } catch { /* not ours, or damaged: leave it alone */ }
    }
  });
  const secured = !!doc.wasSecured;
  const store = doc.catalog.lookupMaybe(PDFName.of(ASSETS_KEY), PDFDict);
  const extra = pages.length - kept.length;
  if (!found.length && !store && !extra) return { baseBytes: bytes, markups: [], assets: [], writable: true, secured };

  const doomed = new Set();         // objects only Redline's markups used
  const doom = ref => { if (ref instanceof PDFRef) doomed.add(ref); };
  const doomResources = res => {
    if (!(res instanceof PDFDict)) return;
    for (const key of ['Font', 'ExtGState', 'XObject']) {
      const sub = res.lookupMaybe(PDFName.of(key), PDFDict);
      if (!sub) continue;
      for (const [, ref] of sub.entries()) {
        doom(ref);
        const o = ref instanceof PDFRef ? ctx.lookup(ref) : null;
        if (o && o.dict) doom(o.dict.get(PDFName.of('SMask')));
      }
    }
  };

  // The pictures and symbols first, while their streams are still there.
  const assets = [];
  if (store) {
    for (const [name, ref] of store.entries()) {
      try {
        const s = ctx.lookup(ref);
        if (!(s instanceof PDFRawStream)) continue;
        const id = name.decodeText(), d = s.dict;
        const kind = d.lookupMaybe(PDFName.of('Kind'), PDFName);
        const n = key => { const v = d.get(PDFName.of(key)); return v && v.asNumber ? v.asNumber() : 0; };
        if (kind && kind.decodeText() === 'vec') {
          const j = JSON.parse(new TextDecoder().decode(PDFLib.decodePDFRawStream(s).decode()));
          assets.push({ id, kind: 'vec', w: j.w, h: j.h, items: j.items });
        } else if (kind) {
          const png = kind.decodeText() === 'png';
          assets.push({ id, kind: 'img', mime: png ? 'image/png' : 'image/jpeg', w: n('W'), h: n('H'), bytes: s.contents.slice(), alpha: png });
        } else {
          assets.push({ id, kind: 'img', mime: 'image/jpeg', w: n('Width'), h: n('Height'), bytes: s.contents.slice(), alpha: false });
        }
        doom(ref);
      } catch (e) { console.warn('could not read a stored picture', e && e.message); }
    }
    doc.catalog.delete(PDFName.of(ASSETS_KEY));
  }

  for (const page of pages) {
    const annots = page.node.Annots();
    if (!annots) continue;
    for (let i = annots.size() - 1; i >= 0; i--) {
      const d = annots.lookupMaybe(i, PDFDict);
      if (!d || !ids.has(owner.get(d))) continue;
      const ref = annots.get(i);
      const ap = d.lookupMaybe(PDFName.of('AP'), PDFDict);
      const n = ap && ap.get(PDFName.of('N'));
      if (n instanceof PDFRef) {
        const s = ctx.lookup(n);
        if (s && s.dict) doomResources(s.dict.lookup(PDFName.of('Resources')));
        doom(n);
      }
      annots.remove(i);
      doom(ref);
    }
  }

  // Photo pages Redline added at the back.
  for (let i = pages.length - 1; i >= 0; i--) {
    const node = pages[i].node;
    if (!node.get(PDFName.of(PAGE_KEY))) continue;
    doomResources(node.lookupMaybe(PDFName.of('Resources'), PDFDict));
    const c = node.get(PDFName.of('Contents'));
    if (c instanceof PDFRef) { const o = ctx.lookup(c); if (o instanceof PDFArray) for (let k = 0; k < o.size(); k++) doom(o.get(k)); doom(c); }
    else if (c instanceof PDFArray) for (let k = 0; k < c.size(); k++) doom(c.get(k));
    doc.removePage(i);
    doom(pages[i].ref);
  }
  for (const ref of doomed) ctx.delete(ref);

  return { baseBytes: await doc.save(), markups: found, assets, writable: true, secured };
}
