// Pins: a numbered marker on the drawing, with a status, a note and site photos.
import { icon } from './icons.js';
import { PIN_STATUS, statusOf, photosOf } from './shapes.js';
import { canvasBytes, newAssetId } from './assets.js';

const INKS = ['#e11d2a', '#facc15', '#ffffff', '#111111'];
const day = ts => new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function initPins(app) {
  const { h } = app.ui, assets = app.assets, $ = id => document.getElementById(id);
  let cur = null;               // the pin whose sheet is open
  let onPhoto = null;           // what to do with the next photo that comes back from the camera or the library
  const library = h('input', { type: 'file', accept: 'image/*', hidden: true });
  document.body.append(library);
  for (const input of [$('file-camera'), library]) {
    input.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f && onPhoto) onPhoto(f); });
  }

  /** Change a pin and keep the change undoable. */
  function edit(m, fn) {
    if (!app.getMarkup(m.id)) return;
    app.pushUndo();
    fn(m);
    app.changed();
  }
  const setPhotos = (m, list) => { m.photos = list; delete m.photo; };

  /**
   * Draw on a photo before it is kept: circle the fault, point at it.
   * Resolves with the asset to keep (a new one if anything was drawn), or null if cancelled.
   */
  function drawOn(box, a) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = h('canvas', { class: 'photo-pad', width: a.w, height: a.h });
        const ctx = canvas.getContext('2d');
        const strokes = [];
        let ink = INKS[0], live = null;
        const paint = () => {
          ctx.drawImage(img, 0, 0, a.w, a.h);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const s of strokes) {
            ctx.strokeStyle = s.ink; ctx.lineWidth = s.w;
            ctx.beginPath();
            s.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
            if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
            ctx.stroke();
          }
        };
        const at = ev => { const r = canvas.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * a.w, ((ev.clientY - r.top) / r.height) * a.h]; };
        canvas.addEventListener('pointerdown', ev => {
          ev.preventDefault();
          try { canvas.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
          live = { ink, w: Math.max(4, Math.max(a.w, a.h) / 150), pts: [at(ev)] };
          strokes.push(live);
          paint();
        });
        canvas.addEventListener('pointermove', ev => {
          if (!live) return;
          const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : [];
          for (const e2 of evs.length ? evs : [ev]) live.pts.push(at(e2));
          paint();
        });
        const end = () => { live = null; };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        const chips = h('div', { class: 'row tight' }, INKS.map(c => {
          const b = h('button', { class: 'chip swatch', 'aria-pressed': String(c === ink), 'aria-label': 'Pen colour', onclick: () => { ink = c; for (const x of chips.querySelectorAll('.chip.swatch')) x.setAttribute('aria-pressed', String(x === b)); } },
            h('span', { class: 'sw', style: `--c:${c}` }));
          return b;
        }), h('button', { class: 'btn slim', onclick: () => { strokes.pop(); paint(); } }, 'Undo'));
        const keep = async () => {
          if (!strokes.length) return resolve(a);
          try {
            const bytes = await canvasBytes(canvas, 'image/jpeg', 0.85);
            resolve(await assets.put({ id: newAssetId(), kind: 'img', mime: 'image/jpeg', w: a.w, h: a.h, bytes, alpha: false }));
          } catch (e) { console.error(e); resolve(a); }
        };
        paint();
        box.textContent = '';
        box.append(
          h('p', { class: 'muted' }, 'Draw on the photo to point something out, or just keep it as it is.'),
          canvas, chips,
          h('div', { class: 'row' },
            h('button', { class: 'btn', onclick: () => resolve(null) }, 'Cancel'),
            h('button', { class: 'btn primary', onclick: keep }, 'Keep photo')));
      };
      img.onerror = () => resolve(a);
      img.src = a.url;
    });
  }

  /** The sheet for a pin: its status, note and photos. */
  async function open(m, isNew = false) {
    cur = m;
    await assets.load(photosOf(m));
    let note = m.note || '';
    const box = h('div', {});
    const keepNote = () => { const text = note.replace(/\s+$/, ''); if (app.getMarkup(m.id) && text !== (m.note || '')) edit(m, x => { x.note = text; }); };

    async function gotPhoto(file) {
      app.ui.busy('Adding photo…');
      let a = null;
      try { a = await assets.fromFile(file, { max: 2000 }); }
      catch (e) { console.error(e); app.ui.toast('That photo would not open'); }
      finally { app.ui.busy(null); }
      if (!a || cur !== m) return;
      const kept = await drawOn(box, a);
      if (kept && cur === m) edit(m, x => setPhotos(x, [...photosOf(x), kept.id]));
      main();
    }
    async function redraw(id) {
      const kept = await drawOn(box, assets.get(id));
      if (kept && kept.id !== id && cur === m) edit(m, x => setPhotos(x, photosOf(x).map(p => (p === id ? kept.id : p))));
      main();
    }

    function main() {
      onPhoto = gotPhoto;
      const status = statusOf(m);
      const ta = h('textarea', { class: 'note-in', rows: 3, placeholder: 'What is it? e.g. Exit sign missing above door', 'aria-label': 'Note' });
      ta.value = note;
      ta.addEventListener('input', () => { note = ta.value; });
      const photos = photosOf(m).map(id => assets.get(id)).filter(Boolean);
      box.textContent = '';
      box.append(
        h('div', { class: 'seg wide', role: 'group', 'aria-label': 'Status' }, Object.entries(PIN_STATUS).map(([id, st]) =>
          h('button', { 'aria-pressed': String(id === status), onclick: () => { keepNote(); edit(m, x => { x.status = id; x.statusAt = Date.now(); }); main(); } }, st.label))),
        h('p', { class: 'muted small' }, status === 'open' ? 'Open: still to be dealt with.' : `${PIN_STATUS[status].label}${m.statusAt ? ` on ${day(m.statusAt)}` : ''}.`),
        ta,
        photos.length ? h('div', { class: 'photo-grid' }, photos.map(a => h('div', { class: 'photo-cell' },
          h('img', { src: a.url, alt: 'Photo for this pin' }),
          h('div', { class: 'row tight' },
            h('button', { class: 'btn slim', onclick: () => { keepNote(); redraw(a.id); } }, 'Draw on it'),
            h('button', { class: 'btn slim danger', onclick: () => { keepNote(); edit(m, x => setPhotos(x, photosOf(x).filter(p => p !== a.id))); main(); } }, 'Remove'))))) : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn', html: `${icon('camera', 22)}<span>${photos.length ? 'Another photo' : 'Take photo'}</span>`, onclick: () => { keepNote(); $('file-camera').click(); } }),
          h('button', { class: 'btn', html: `${icon('photo', 22)}<span>Choose photo</span>`, onclick: () => { keepNote(); library.click(); } })),
        h('div', { class: 'row' },
          isNew ? null : h('button', { class: 'btn danger', onclick: () => { app.ui.closeSheet(); app.select(m.id); app.deleteSelected(); } }, 'Delete pin'),
          h('button', { class: 'btn primary', onclick: () => app.ui.closeSheet() }, 'Done')),
        h('p', { class: 'muted small' }, 'Notes, status and photos go into the site report. Photos are added as pages at the back of the exported PDF.'));
    }

    main();
    app.ui.openSheet(`Pin ${m.n}`, box, { onClose: () => { keepNote(); cur = null; onPhoto = null; } });
  }

  app.pins = { open };
}
