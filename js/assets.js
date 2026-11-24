// Pictures (photos, stickers) and drawn symbols that markups point at.
// They are kept on the device once, by id, and held in memory while a drawing that uses them is open.
import * as store from './store.js';
import { photosOf } from './shapes.js';

const cache = new Map();      // id → { id, kind: 'vec' | 'img', w, h, items | bytes + mime, alpha, url }

export const get = id => cache.get(id) || null;

function ready(a) {
  if (a.kind === 'img' && !a.url) a.url = URL.createObjectURL(new Blob([a.bytes], { type: a.mime }));
  cache.set(a.id, a);
  return a;
}

/** Bring these ids into memory (those that exist on this device). */
export async function load(ids) {
  const want = [...new Set(ids)].filter(id => id && !cache.has(id));
  await Promise.all(want.map(async id => {
    try { const a = await store.getAsset(id); if (a) ready(a); } catch { /* storage unavailable */ }
  }));
}

/** Keep a picture or symbol on the device. */
export async function put(a) {
  if (cache.has(a.id)) return cache.get(a.id);
  const rec = { id: a.id, kind: a.kind, w: a.w, h: a.h };
  if (a.kind === 'vec') rec.items = a.items;
  else { rec.mime = a.mime; rec.bytes = a.bytes; rec.alpha = !!a.alpha; }
  try { await store.putAsset(rec); } catch (e) { console.warn('could not keep a picture', e); }
  return ready({ ...rec });
}

/** Ids a set of markups leans on. */
export function idsOf(markups) {
  const ids = new Set();
  for (const m of markups || []) {
    if (m.type === 'stamp' && m.sym) ids.add(m.sym);
    if (m.type === 'pin') for (const id of photosOf(m)) ids.add(id);
  }
  return [...ids];
}

/** Remove pictures nothing uses any more: not a stored drawing, not the tray. */
export async function sweep() {
  try {
    const keep = new Set((await store.listLibrary()).map(e => e.asset));
    for (const d of await store.listDocs()) for (const id of idsOf(d.markups)) keep.add(id);
    const gone = (await store.assetKeys()).filter(id => !keep.has(id));
    if (!gone.length) return;
    await store.deleteAssets(gone);
    for (const id of gone) { const a = cache.get(id); if (a && a.url) URL.revokeObjectURL(a.url); cache.delete(id); }
  } catch (e) { console.warn('tidy-up skipped', e); }
}

/** Short, stable id from content: the same symbol brought in twice is stored once. */
export function hashId(prefix, text) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return prefix + (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// ---- making pictures --------------------------------------------------------

export const canvasBytes = (canvas, mime, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(async b => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('no picture'))), mime, quality);
});

async function decode(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* older browsers */ }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
}

/**
 * A photo or picture file → something small enough to keep and to put in a PDF.
 * `keepAlpha` keeps see-through parts (stickers); otherwise it becomes a JPEG (photos).
 */
export async function fromFile(file, { max = 2000, keepAlpha = false } = {}) {
  const src = await decode(file);
  const sw = src.naturalWidth || src.width, sh = src.naturalHeight || src.height;
  const f = Math.min(1, max / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * f)), h = Math.max(1, Math.round(sh * f));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  const png = keepAlpha && /png|webp|gif|svg/i.test(file.type);
  if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(src, 0, 0, w, h);
  if (src.close) src.close();
  const mime = png ? 'image/png' : 'image/jpeg';
  const bytes = await canvasBytes(canvas, mime, 0.85);
  return put({ id: newAssetId(), kind: 'img', mime, w, h, bytes, alpha: png });
}

/** A canvas (a snip of a page) → a see-through PNG sticker. */
export async function fromCanvas(canvas) {
  const bytes = await canvasBytes(canvas, 'image/png');
  return put({ id: newAssetId(), kind: 'img', mime: 'image/png', w: canvas.width, h: canvas.height, bytes, alpha: true });
}

export const newAssetId = () => 'a' + Array.from({ length: 15 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

/** A small picture of an asset for a tile or a list row. */
export function thumb(a, size = 64, tint = null) {
  if (!a) return '';
  const col = c => (tint && c && !/^#f{3}(f{3})?$/i.test(c) ? tint : c);
  if (a.kind === 'img') return `<img src="${a.url}" alt="" style="max-width:${size}px;max-height:${size}px">`;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const r2 = n => Math.round(n * 100) / 100;
  let body = '';
  for (const it of a.items) {
    if (it.t === 'text') {
      body += `<text x="${r2(it.x)}" y="${r2(it.y + it.size * 0.36)}" font-size="${r2(it.size)}" text-anchor="middle" fill="${col(it.color || '#000000')}" font-family="Helvetica, Arial, sans-serif">${esc(it.s)}</text>`;
    } else {
      const d = it.d.map(c => (c[0] === 'Z' ? 'Z' : c[0] + c.slice(1).map(r2).join(' '))).join('');
      body += `<path d="${d}" fill="${col(it.fill) || 'none'}" stroke="${col(it.stroke) || 'none'}" stroke-width="${r2(it.w || 0.5)}" stroke-linecap="round" stroke-linejoin="round"${it.eo ? ' fill-rule="evenodd"' : ''}${it.dash ? ` stroke-dasharray="${it.dash.join(' ')}"` : ''}/>`;
    }
  }
  const pad = Math.max(a.w, a.h) * 0.06;
  return `<svg viewBox="${r2(-pad)} ${r2(-pad)} ${r2(a.w + 2 * pad)} ${r2(a.h + 2 * pad)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${body}</svg>`;
}
