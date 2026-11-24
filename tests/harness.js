// Test helpers for driving the app from the browser console on this PC:
//   await import('/tests/harness.js')
// T.drag / T.tap act at page coordinates; files the app hands over are saved to tests/out/ instead of downloaded.
const app = window.redline, st = app.el.stage;
window.__errs = window.__errs || [];
window.addEventListener('error', e => window.__errs.push(String(e.message)));
window.addEventListener('unhandledrejection', e => window.__errs.push(`rejected: ${String((e.reason && e.reason.message) || e.reason)}`));

window.T = {
  wait: ms => new Promise(r => setTimeout(r, ms)),
  c(px, py) { const r = st.getBoundingClientRect(), v = app.viewer.view; return [r.left + px * v.scale + v.tx, r.top + py * v.scale + v.ty]; },
  ev(type, x, y, target) {
    (target || st).dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true }));
  },
  drag(x1, y1, x2, y2, n = 6) {
    const [a, b] = this.c(x1, y1), [c, d] = this.c(x2, y2);
    this.ev('pointerdown', a, b, document.elementFromPoint(a, b) || st);
    for (let i = 1; i <= n; i++) this.ev('pointermove', a + ((c - a) * i) / n, b + ((d - b) * i) / n);
    this.ev('pointerup', c, d);
  },
  tap(x, y) { const [a, b] = this.c(x, y); this.ev('pointerdown', a, b, document.elementFromPoint(a, b) || st); this.ev('pointerup', a, b); },
  /** Put a file into one of the app's hidden file pickers, as if the user had chosen it. */
  async choose(inputId, url, name, type) {
    const blob = await (await fetch(url)).blob();
    const dt = new DataTransfer();
    dt.items.add(new File([blob], name, { type: type || blob.type }));
    const input = typeof inputId === 'string' ? document.getElementById(inputId) : inputId;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  },
  saved: [],
  async fresh(url, name) {
    const store = await import('/js/store.js');
    for (const d of await store.listDocs()) await app.removeStored(d.id);
    await app.openBytes(name || url.split('/').pop(), new Uint8Array(await (await fetch(url)).arrayBuffer()));
  },
};

// Finished files go to tests/out/ so they can be opened and checked.
app.ui.deliver = async (bytes, name, mime, note) => {
  await fetch(`/__save?name=${encodeURIComponent(name)}`, { method: 'POST', body: bytes });
  window.T.saved.push({ name, size: bytes.length || bytes.byteLength || bytes.size, mime, note });
};
export default window.T;
