// Compare two revisions: another PDF is laid over the drawing, and what differs shows in colour.
import { icon } from './icons.js';

export function initCompare(app) {
  const { h } = app.ui;
  let other = null;       // { pdf, name }
  const pick = h('input', { type: 'file', accept: 'application/pdf,.pdf', hidden: true });
  const bar = h('div', { id: 'comparebar', class: 'stage-ui', hidden: true });
  document.body.append(pick);
  app.el.stage.append(bar);

  function paint() {
    bar.hidden = !other;
    bar.textContent = '';
    if (!other) return;
    const key = (c, t) => h('span', { class: 'cmp-key' }, h('span', { class: 'sw', style: `--c:${c}` }), t);
    bar.append(
      h('span', { class: 'cmp-name' }, `Compared with ${other.name}`),
      key('#2563eb', 'only in this drawing'), key('#dc2626', 'only in the other'),
      h('button', { class: 'tb icon', 'aria-label': 'Stop comparing', html: icon('close'), onclick: stop }));
  }

  function stop() {
    if (!other) return;
    const pdf = other.pdf;
    other = null;
    app.viewer.setCompare(null);
    app.closePdf(pdf);
    paint();
  }

  async function begin(file) {
    app.ui.busy('Opening the other revision…');
    try {
      const pdf = await app.loadPdfjs(new Uint8Array(await file.arrayBuffer()));
      if (other) app.closePdf(other.pdf);
      other = { pdf, name: file.name };
      app.viewer.setCompare(pdf);
      paint();
      const mine = app.doc.pageCount, theirs = pdf.numPages;
      app.ui.toast(theirs === 1 || theirs === mine ? 'Grey is the same in both. Colour is what changed.' : `The other PDF has ${theirs} pages and this one has ${mine}: pages are matched by number.`);
    } catch (e) {
      console.error(e);
      app.ui.alert('That file would not open', 'It may not be a PDF, or it may be damaged.');
    } finally { app.ui.busy(null); }
  }
  pick.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f && app.doc) begin(f); });

  /** From the More menu: choose the other revision, or stop if a comparison is on. */
  function start() {
    app.ui.closeSheet();
    if (other) return stop();
    pick.click();
  }

  app.compare = { start, stop, begin, get on() { return !!other; } };
}
