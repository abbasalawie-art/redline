// Pins: a numbered marker on the drawing, with a note and a site photo.
import { icon } from './icons.js';

export function initPins(app) {
  const { h } = app.ui, assets = app.assets, $ = id => document.getElementById(id);
  let cur = null;       // the pin whose sheet is open
  let repaint = () => {};
  const library = h('input', { type: 'file', accept: 'image/*', hidden: true });
  document.body.append(library);

  async function addPhoto(file) {
    if (!file || !cur || !app.getMarkup(cur.id)) return;
    app.ui.busy('Adding photo…');
    try {
      const a = await assets.fromFile(file, { max: 2000 });
      app.pushUndo();
      cur.photo = a.id;
      app.changed();
      repaint();
    } catch (e) {
      console.error(e);
      app.ui.toast('That photo would not open');
    } finally { app.ui.busy(null); }
  }
  for (const input of [$('file-camera'), library]) {
    input.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; addPhoto(f); });
  }

  /** The note-and-photo sheet for a pin. */
  async function open(m, isNew = false) {
    cur = m;
    await assets.load([m.photo]);
    const note = h('textarea', { class: 'note-in', rows: 3, placeholder: 'What is it? e.g. Exit sign missing above door', 'aria-label': 'Note' });
    note.value = m.note || '';
    const pic = h('div', { class: 'pin-photo' });
    repaint = () => {
      pic.textContent = '';
      const a = m.photo && assets.get(m.photo);
      if (a) {
        pic.append(h('img', { src: a.url, alt: 'Photo for this pin' }),
          h('div', { class: 'row' },
            h('button', { class: 'btn slim', html: `${icon('camera', 20)}<span>Retake</span>`, onclick: () => $('file-camera').click() }),
            h('button', { class: 'btn slim danger', onclick: () => { app.pushUndo(); m.photo = null; app.changed(); repaint(); } }, 'Remove photo')));
      } else {
        pic.append(h('div', { class: 'row' },
          h('button', { class: 'btn', html: `${icon('camera', 22)}<span>Take photo</span>`, onclick: () => $('file-camera').click() }),
          h('button', { class: 'btn', html: `${icon('photo', 22)}<span>Choose photo</span>`, onclick: () => library.click() })));
      }
    };
    repaint();
    const keepNote = () => {
      const text = note.value.replace(/\s+$/, '');
      if (app.getMarkup(m.id) && text !== (m.note || '')) { app.pushUndo(); m.note = text; app.changed(); }
      cur = null;
    };
    app.ui.openSheet(`Pin ${m.n}`, [
      note,
      pic,
      h('div', { class: 'row' },
        isNew ? null : h('button', { class: 'btn danger', onclick: () => { app.ui.closeSheet(); app.select(m.id); app.deleteSelected(); } }, 'Delete pin'),
        h('button', { class: 'btn primary', onclick: () => app.ui.closeSheet() }, 'Done')),
      h('p', { class: 'muted small' }, 'Pins are numbered in the order you place them. Notes and photos go into the site report, and photos are added as pages at the back of the exported PDF.'),
    ], { onClose: keepNote });
  }

  app.pins = { open };
}
