// Shows one page: a whole-page picture underneath, plus a sharp re-render of just the
// visible area once zooming or panning stops. Markups live in an SVG on top.
import { clamp, sheetFactor } from './geometry.js';

const BASE_MAX_PX = 5e6;      // whole-page picture budget (pixels)
const DETAIL_MAX_PX = 8e6;    // visible-area picture budget
export const MAX_SCALE = 12;
const FORMS_ON_TOP = 2;       // pdf.js leaves form fields off the picture; Redline draws the answers itself

const invert = ([a, b, c, d, e, f]) => {
  const det = a * d - b * c;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
};

export function createViewer(els, onView) {
  const { stage, layer, base, detail, svg } = els;
  const view = { scale: 1, tx: 0, ty: 0 };
  let pdf = null, page = null, W = 1, H = 1, baseScale = 1, fitScale = 1;
  let gen = 0, baseTask = null, detailTask = null, settleTimer = 0;
  const info = new Map();     // page index → { w, h, k, matrix }

  const stageSize = () => ({ w: stage.clientWidth, h: stage.clientHeight });
  const dpr = () => Math.min(window.devicePixelRatio || 1, 3);

  function apply() {
    layer.style.width = `${W * view.scale}px`;
    layer.style.height = `${H * view.scale}px`;
    layer.style.transform = `translate(${view.tx}px, ${view.ty}px)`;
    svg.style.setProperty('--hit', `${28 / view.scale}px`);
    onView(view);
  }

  function limit() {
    const s = stageSize();
    view.scale = clamp(view.scale, fitScale * 0.5, Math.max(MAX_SCALE, fitScale * 4));
    view.tx = clamp(view.tx, s.w / 2 - W * view.scale, s.w / 2);
    view.ty = clamp(view.ty, s.h / 2 - H * view.scale, s.h / 2);
  }

  function setView(v, { settle: doSettle = false } = {}) {
    Object.assign(view, v);
    limit();
    apply();
    if (doSettle) settle();
  }

  function computeFit() {
    const s = stageSize(), m = 12;
    fitScale = Math.max(0.02, Math.min((s.w - 2 * m) / W, (s.h - 2 * m) / H));
  }

  function fit() {
    const s = stageSize();
    computeFit();
    setView({ scale: fitScale, tx: (s.w - W * fitScale) / 2, ty: (s.h - H * fitScale) / 2 }, { settle: true });
  }

  /** Zoom by `factor`, keeping the stage point (sx, sy) fixed. */
  function zoomAt(factor, sx, sy) {
    const px = (sx - view.tx) / view.scale, py = (sy - view.ty) / view.scale;
    const scale = clamp(view.scale * factor, fitScale * 0.5, Math.max(MAX_SCALE, fitScale * 4));
    setView({ scale, tx: sx - px * scale, ty: sy - py * scale }, { settle: true });
  }

  function toPage(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    return { x: (clientX - r.left - view.tx) / view.scale, y: (clientY - r.top - view.ty) / view.scale };
  }
  const toStage = (x, y) => ({ x: x * view.scale + view.tx, y: y * view.scale + view.ty });

  async function pageInfo(index) {
    if (info.has(index)) return info.get(index);
    const p = await pdf.getPage(index + 1);
    const vp = p.getViewport({ scale: 1 });
    const rec = { w: vp.width, h: vp.height, k: sheetFactor(vp.width, vp.height), matrix: invert(vp.transform) };
    info.set(index, rec);
    return rec;
  }

  function cancelTasks() {
    for (const t of [baseTask, detailTask]) { try { t && t.cancel(); } catch { /* already done */ } }
    baseTask = detailTask = null;
    clearTimeout(settleTimer);
  }

  async function renderInto(canvas, viewport, which) {
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const task = page.render({ canvas, canvasContext: ctx, viewport, annotationMode: FORMS_ON_TOP });
    if (which === 'base') baseTask = task; else detailTask = task;
    await task.promise;
  }

  async function renderBase() {
    const my = gen;
    const d = dpr();
    let s = Math.max(fitScale, 0.1) * d;
    if (W * s * H * s > BASE_MAX_PX) s = Math.sqrt(BASE_MAX_PX / (W * H));
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(W * s));
    off.height = Math.max(1, Math.round(H * s));
    try {
      await renderInto(off, page.getViewport({ scale: s }), 'base');
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    }
    if (my !== gen) return;
    baseScale = s;
    base.width = off.width; base.height = off.height;
    base.getContext('2d').drawImage(off, 0, 0);
    layer.classList.remove('loading');
    settle(0);
  }

  async function renderDetail() {
    const my = gen;
    if (!page) return;
    const d = dpr(), want = view.scale * d;
    if (want <= baseScale * 1.08) { detail.style.display = 'none'; return; }
    const s0 = stageSize();
    const padX = (s0.w / view.scale) * 0.2, padY = (s0.h / view.scale) * 0.2;
    const x0 = clamp(-view.tx / view.scale - padX, 0, W), x1 = clamp((s0.w - view.tx) / view.scale + padX, 0, W);
    const y0 = clamp(-view.ty / view.scale - padY, 0, H), y1 = clamp((s0.h - view.ty) / view.scale + padY, 0, H);
    if (x1 - x0 < 1 || y1 - y0 < 1) return;
    let s = want;
    const px = (x1 - x0) * s * (y1 - y0) * s;
    if (px > DETAIL_MAX_PX) s *= Math.sqrt(DETAIL_MAX_PX / px);
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round((x1 - x0) * s));
    off.height = Math.max(1, Math.round((y1 - y0) * s));
    try { detailTask && detailTask.cancel(); } catch { /* fine */ }
    try {
      await renderInto(off, page.getViewport({ scale: s, offsetX: -x0 * s, offsetY: -y0 * s }), 'detail');
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      throw e;
    }
    if (my !== gen) return;
    detail.width = off.width; detail.height = off.height;
    detail.getContext('2d').drawImage(off, 0, 0);
    Object.assign(detail.style, {
      display: 'block',
      left: `${(x0 / W) * 100}%`, top: `${(y0 / H) * 100}%`,
      width: `${((x1 - x0) / W) * 100}%`, height: `${((y1 - y0) / H) * 100}%`,
    });
  }

  /** Call when the view has stopped moving: sharpens the visible area. */
  function settle(delay = 160) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => { renderDetail().catch(err => console.warn('detail render', err)); }, delay);
  }

  async function showPage(index) {
    gen++;
    cancelTasks();
    page = await pdf.getPage(index + 1);
    const rec = await pageInfo(index);
    W = rec.w; H = rec.h;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    detail.style.display = 'none';
    layer.classList.add('loading');
    base.width = base.height = 1;
    fit();
    renderBase().catch(err => console.warn('page render', err));
    return rec;
  }

  /**
   * A picture of part of a page: r in page units, `pxPerPt` pixels per point.
   * Without `background` the paper is left see-through (for stickers).
   */
  async function renderRegion(index, r, pxPerPt, { background = 'rgba(0,0,0,0)', source = pdf } = {}) {
    const p = await source.getPage(index + 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(r.w * pxPerPt));
    canvas.height = Math.max(1, Math.round(r.h * pxPerPt));
    const viewport = p.getViewport({ scale: pxPerPt, offsetX: -r.x * pxPerPt, offsetY: -r.y * pxPerPt });
    await p.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, background }).promise;
    return canvas;
  }

  function setDocument(doc) {
    gen++;
    cancelTasks();
    pdf = doc; page = null;
    info.clear();
  }

  function resized() {
    if (!page) return;
    const old = fitScale, wasFit = Math.abs(view.scale - old) < 1e-6;
    computeFit();
    if (wasFit) fit(); else setView({}, { settle: true });
  }

  return {
    view, setView, fit, zoomAt, toPage, toStage, settle, showPage, setDocument, pageInfo, resized, renderRegion,
    get size() { return { w: W, h: H }; },
    get fitScale() { return fitScale; },
  };
}
