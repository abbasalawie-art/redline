// The Symbols tray: legend symbols, your own stickers, text stamps, saved tools and your signature.
import { icon } from './icons.js';
import { parsePath, arcSegments } from './geometry.js';
import * as store from './store.js';
import { newId } from './tools.js';
import { TOOL_NAME, COLORS } from './ui.js';

const DEFAULT_STAMPS = ['DEFECT', 'NOT INSTALLED', 'RELOCATE', 'REMOVE', 'AS BUILT', 'CHECKED', 'COMPLETE', 'NOT TO DRAWING'];
const STAMP_RED = '#e11d2a';
const ALT_PINK = '#db2777';
const MY_GROUP = 'My stickers';

export function initKit(app) {
  const { h } = app.ui, assets = app.assets, $ = id => document.getElementById(id);
  let lib = [];                 // tray entries: { id, name, tag, group, asset, w, h, order, auto }
  let editing = false, filter = '';
  // The tray's contents, and the drawings behind them, are brought into memory at start-up so a symbol is ready the moment it is chosen.
  const ready = store.listLibrary()
    .then(list => { lib = list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); return assets.load(lib.map(e => e.asset)); })
    .then(() => { if (app.ui) app.ui.refresh(); })
    .catch(() => {});
  if (!app.prefs.stamps) app.prefs.stamps = DEFAULT_STAMPS.slice();

  const stampPrefs = () => app.prefs.tools.stamp;
  const entryOf = id => lib.find(e => e.id === id) || textEntry(id);

  // ---- text stamps: a word in a box, drawn rather than stored -------------
  function roundRect(x, y, w, hh, r) {
    return [['M', x + r, y], ['L', x + w - r, y], ...arcSegments(x + w - r, y + r, r, -Math.PI / 2, 0), ['L', x + w, y + hh - r],
      ...arcSegments(x + w - r, y + hh - r, r, 0, Math.PI / 2), ['L', x + r, y + hh], ...arcSegments(x + r, y + hh - r, r, Math.PI / 2, Math.PI),
      ['L', x, y + r], ...arcSegments(x + r, y + r, r, Math.PI, Math.PI * 1.5), ['Z']];
  }
  function textAsset(text) {
    const size = 11, w = app.font.width(text, size) + 14, hh = 20;
    const items = [
      { d: roundRect(0.8, 0.8, w - 1.6, hh - 1.6, 3), stroke: STAMP_RED, fill: '#ffffff', w: 1.5, join: 'round' },
      { t: 'text', s: text, x: w / 2, y: hh / 2, size, color: STAMP_RED },
    ];
    return { id: assets.hashId('t', text), kind: 'vec', w, h: hh, items };
  }
  function textEntry(id) {
    if (!id || !id.startsWith('text:')) return null;
    const text = id.slice(5);
    if (!app.prefs.stamps.includes(text)) return null;
    const a = textAsset(text);
    return { id, name: text, group: 'Stamps', asset: a.id, w: a.w, h: a.h, auto: true, make: a };
  }

  // ---- placing ------------------------------------------------------------
  function current() { return entryOf(stampPrefs().lib); }

  /** A new symbol markup centred on p, or null when no symbol is chosen yet. */
  function newStamp(p) {
    const e = current();
    if (!e) return null;
    let a = assets.get(e.asset);
    if (!a && e.make) { assets.put(e.make); a = assets.get(e.asset) || e.make; }
    if (!a) { assets.load([e.asset]).then(() => app.ui.refresh()); return null; }
    const d = stampPrefs(), k = app.doc.pageInfo.k, f = e.auto ? k : 1;
    const nw = e.w * f, nh = e.h * f, w = nw * (d.scale || 1), hh = nh * (d.scale || 1);
    return {
      id: newId(), page: app.doc.pageIndex, type: 'stamp', k, sym: e.asset, name: e.tag ? `${e.tag} ${e.name}` : e.name, nw, nh,
      rect: { x: p.x - w / 2, y: p.y - hh / 2, w, h: hh }, rot: d.rot || 0, tint: tintFor(e), opacity: d.opacity ?? 1,
    };
  }

  function newSignature(p) {
    const s = app.prefs.signature;
    if (!s) return null;
    const d = app.prefs.tools.sig, k = app.doc.pageInfo.k;
    const w = 150 * k, hh = Math.max(12 * k, Math.min(w / s.aspect, 110 * k));
    return { id: newId(), page: app.doc.pageIndex, type: 'sig', k, color: d.color, width: (d.width ?? 1) * k, opacity: d.opacity ?? 1, strokes: s.strokes, rect: { x: p.x - w / 2, y: p.y - hh / 2, w, h: hh } };
  }

  const canTint = m => { const a = assets.get(m.sym); return !!a && (a.kind === 'vec' || a.alpha); };

  // ---- Markup or Design ---------------------------------------------------
  // Markup: symbols go down in your markup colour, so they stand apart from the drawing.
  // Design: symbols go down exactly as they are on the legend.
  const mode = () => (stampPrefs().mode === 'design' ? 'design' : 'markup');
  const markColour = () => stampPrefs().markColor || STAMP_RED;
  /** Can this tray entry take the markup colour? Photos and logos brought in as pictures never do. */
  const tintable = e => { const a = e && (assets.get(e.asset) || e.make); return !!e && !e.asDrawn && !!a && (a.kind === 'vec' || !!a.alpha); };
  // A symbol the legend already draws in the markup colour (the red dry fire symbols, with red markups) would look
  // no different marked up. Those go down in a second colour instead.
  const altColour = () => stampPrefs().altColor || ALT_PINK;
  const rgbOf = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const alike = (a, b) => { const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 100; };
  const own = new Map();        // asset id -> the colour most of the symbol is drawn in
  function ownColour(a) {
    if (!a || a.kind !== 'vec') return null;
    if (own.has(a.id)) return own.get(a.id);
    const weight = new Map();
    const add = (c, n) => { if (c && /^#[0-9a-f]{6}$/i.test(c) && !/^#f{6}$/i.test(c)) weight.set(c.toLowerCase(), (weight.get(c.toLowerCase()) || 0) + n); };
    // The line work decides. A tag beside the symbol (usually black) only counts when there is no line work at all.
    for (const it of a.items) if (it.t !== 'text') { add(it.stroke, it.d.length); add(it.fill, it.d.length); }
    if (!weight.size) for (const it of a.items) if (it.t === 'text') add(it.color || '#000000', it.s.length);
    const best = [...weight].sort((x, y) => y[1] - x[1])[0];
    own.set(a.id, best ? best[0] : null);
    return own.get(a.id);
  }
  const clashes = a => { const c = ownColour(a); return !!c && alike(c, markColour()); };
  /**
   * Does this tray entry need the second colour? Decided for its whole group, so that a group marks up in one colour:
   * if at least half of a group is drawn in the markup colour on the legend, all of it uses the second colour.
   */
  function needsSecond(e) {
    if (!e || e.make) return false;                       // a text stamp always takes the markup colour itself
    const g = e.group || MY_GROUP;
    const drawn = lib.filter(x => (x.group || MY_GROUP) === g).map(x => assets.get(x.asset)).filter(a => a && a.kind === 'vec');
    if (!drawn.length) return clashes(assets.get(e.asset));
    return drawn.filter(clashes).length * 2 >= drawn.length;
  }
  const entryFor = assetId => lib.find(x => x.asset === assetId) || null;
  /** The colour a symbol takes in Markup. */
  const markupTint = (assetId, e = entryFor(assetId)) => ((e ? needsSecond(e) : clashes(assets.get(assetId))) ? altColour() : markColour());
  const tintFor = e => (mode() === 'markup' && tintable(e) ? (e.make ? markColour() : markupTint(e.asset, e)) : null);
  const currentCanTint = () => tintable(current());
  const currentTint = () => tintFor(current());
  /** A colour was picked: it becomes the second colour if the symbol in hand is one that uses it, the markup colour otherwise. */
  function rememberColour(value, m) {
    const e = m ? entryFor(m.sym) : current();
    const second = e ? needsSecond(e) : clashes(assets.get(m && m.sym));
    if (second) stampPrefs().altColor = value; else stampPrefs().markColor = value;
  }
  function setMode(v) {
    stampPrefs().mode = v;
    app.savePrefs();
  }
  /** The Markup | Design switch, for the options bar and the tray. */
  function modeSwitch(value, onpick) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': 'Symbol colours' },
      [['markup', 'Markup'], ['design', 'Design']].map(([id, name]) => h('button', { 'aria-pressed': String(id === value), onclick: () => onpick(id) }, name)));
  }

  function choose(entry) {
    if (entry.make) assets.put(entry.make);
    stampPrefs().lib = entry.id;
    app.savePrefs();
    app.ui.closeSheet();
    app.setTool('stamp');
    app.ui.toast(`${entry.name}: tap to place. Keeps placing until you pick another tool.`);
  }

  function currentButton() {
    const e = current(), a = e ? (assets.get(e.asset) || e.make) : null;
    if (e && !a) assets.load([e.asset]).then(() => app.ui.refresh());
    return h('button', { class: 'prop sym-now', onclick: open, html: `${a ? assets.thumb(a, 30, tintFor(e)) : icon('kit', 22)}<span>${e ? esc(e.tag ? `${e.tag} · ${e.name}` : e.name) : 'Choose a symbol'}</span>` });
  }
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  // ---- the tray -----------------------------------------------------------
  function tile(e, onclick, onremove) {
    const a = assets.get(e.asset) || e.make;
    const t = h('button', { class: 'sym', title: e.name, 'aria-pressed': String(stampPrefs().lib === e.id && app.tool === 'stamp'), onclick: () => (editing && onremove ? onremove() : onclick()) },
      h('span', { class: 'sym-pic', html: a ? assets.thumb(a, 54, tintFor(e)) : '' }),
      h('span', { class: 'sym-name' }, e.tag ? h('b', {}, e.tag) : null, e.tag ? ` ${e.name}` : e.name));
    if (editing && onremove) t.append(h('span', { class: 'sym-x', html: icon('close', 16) }));
    return t;
  }

  async function open() {
    if (!app.doc) return;
    if (app.editing) app.commitEdit();
    await ready;
    await assets.load(lib.map(e => e.asset));
    const body = h('div', { class: 'kit' });
    const draw = () => {
      body.textContent = '';
      body.append(h('div', { class: 'kit-mode' },
        modeSwitch(mode(), v => { setMode(v); draw(); app.ui.refresh(); }),
        mode() === 'markup'
          ? h('span', { class: 'muted small kit-mode-note' }, 'Symbols go down in your markup colour', h('span', { class: 'sw', style: `--c:${markColour()}` }),
            '. Groups the legend already draws in that colour use', h('span', { class: 'sw', style: `--c:${altColour()}` }), '.')
          : h('span', { class: 'muted small' }, 'Symbols go down as they are on the legend.')));
      const q = filter.trim().toLowerCase();
      const match = e => !q || `${e.name} ${e.tag || ''} ${e.group || ''}`.toLowerCase().includes(q);
      const section = (title, kids, extra) => {
        if (!kids.length && !extra) return;
        body.append(h('h3', {}, title, extra || null), h('div', { class: 'sym-grid' }, kids));
      };

      // saved tools
      const favs = (app.prefs.favourites || []).filter(f => !q || f.name.toLowerCase().includes(q));
      section('Saved tools', favs.map(f => {
        const t = h('button', { class: 'sym', title: f.name, onclick: () => (editing ? removeFavourite(f.id) : useFavourite(f)) },
          h('span', { class: 'sym-pic fav', style: `color:${f.style.color || f.style.textColor || '#111'}`, html: icon(f.tool === 'ellipse' ? 'ellipse' : f.tool, 34) }),
          h('span', { class: 'sym-name' }, f.name));
        if (editing) t.append(h('span', { class: 'sym-x', html: icon('close', 16) }));
        return t;
      }));

      // signature
      if (!q) {
        section('Signature', [
          h('button', { class: 'sym', onclick: () => (app.prefs.signature ? (app.ui.closeSheet(), app.setTool('sig'), app.ui.toast('Tap where your signature goes')) : signaturePad()) },
            h('span', { class: 'sym-pic', html: app.prefs.signature ? sigThumb(app.prefs.signature) : icon('sign', 34) }),
            h('span', { class: 'sym-name' }, app.prefs.signature ? 'Place signature' : 'Add your signature')),
          app.prefs.signature ? h('button', { class: 'sym', onclick: signaturePad }, h('span', { class: 'sym-pic', html: icon('edit', 30) }), h('span', { class: 'sym-name' }, 'Sign again')) : null,
        ]);
      }

      // text stamps
      const stamps = app.prefs.stamps.map(t => textEntry(`text:${t}`)).filter(e => e && match(e));
      section('Stamps', [
        ...stamps.map(e => tile(e, () => choose(e), () => { app.prefs.stamps = app.prefs.stamps.filter(t => t !== e.name); app.savePrefs(); draw(); })),
        q ? null : h('button', { class: 'sym add', onclick: addTextStamp }, h('span', { class: 'sym-pic', html: icon('plus', 30) }), h('span', { class: 'sym-name' }, 'New stamp')),
      ]);

      // symbols, by group
      const groupsSeen = [];
      for (const e of lib) if (match(e) && !groupsSeen.includes(e.group || MY_GROUP)) groupsSeen.push(e.group || MY_GROUP);
      for (const gname of groupsSeen) {
        const list = lib.filter(e => (e.group || MY_GROUP) === gname && match(e));
        const all = editing ? h('button', { class: 'link danger', onclick: () => removeEntries(lib.filter(e => (e.group || MY_GROUP) === gname), `all ${list.length} in "${gname}"`) }, 'Remove group') : null;
        section(`${gname} · ${list.length}`, list.map(e => tile(e, () => choose(e), () => removeEntries([e], `"${e.name}"`))), all);
      }
      if (!lib.length && !q) {
        body.append(h('div', { class: 'note' }, h('b', {}, 'No symbols yet. '),
          'Bring in a symbol set (a .redlinekit file) made from your legend, or cut your own sticker from any drawing with New sticker.'));
      }
      if (q && body.children.length < 2) body.append(h('div', { class: 'empty' }, 'Nothing matches.'));
    };

    const search = h('input', { type: 'search', class: 'kit-search', placeholder: 'Find a symbol', value: filter, 'aria-label': 'Find a symbol' });
    search.addEventListener('input', () => { filter = search.value; draw(); });
    const editBtn = h('button', { class: 'btn slim', 'aria-pressed': String(editing), onclick: () => { editing = !editing; editBtn.setAttribute('aria-pressed', String(editing)); editBtn.textContent = editing ? 'Done' : 'Edit'; draw(); } }, editing ? 'Done' : 'Edit');
    const bar = h('div', { class: 'kit-bar' },
      search,
      h('button', { class: 'btn slim', html: `${icon('snip', 20)}<span>New sticker</span>`, onclick: () => { app.ui.closeSheet(); app.setTool('snip'); app.ui.hint('Drag a box around what you want as a sticker'); } }),
      h('button', { class: 'btn slim', html: `${icon('photo', 20)}<span>Picture</span>`, onclick: () => $('file-photo').click() }),
      h('button', { class: 'btn slim', html: `${icon('download', 20)}<span>Symbol set</span>`, onclick: () => $('file-kit').click() }),
      editBtn);
    draw();
    app.ui.openSheet('Symbols', [bar, body], { wide: true, onClose: () => { editing = false; } });
    redraw = draw;
  }
  let redraw = () => {};

  async function removeEntries(list, what) {
    if (!window.confirm(`Remove ${what} from the tray? Symbols already placed on drawings stay where they are.`)) return;
    const ids = new Set(list.map(e => e.id));
    if (list.some(e => e.builtIn)) { app.prefs.builtInRemoved = true; app.savePrefs(); }      // do not bring back what was taken out on purpose
    lib = lib.filter(e => !ids.has(e.id));
    await store.removeLibrary([...ids]).catch(() => {});
    if (ids.has(stampPrefs().lib)) { stampPrefs().lib = null; app.savePrefs(); }
    redraw();
    assets.sweep();
  }

  function addTextStamp() {
    const t = (window.prompt('Words on the stamp:') || '').trim().toUpperCase();
    if (!t) return;
    const clean = app.font.clean(t).slice(0, 40);
    if (!app.prefs.stamps.includes(clean)) { app.prefs.stamps.push(clean); app.savePrefs(); }
    redraw();
  }

  // ---- saved tools --------------------------------------------------------
  function addFavourite(tool) {
    const style = { ...app.prefs.tools[tool] };
    const colour = (COLORS.find(c => c[0] === (style.color || style.textColor)) || [0, ''])[1];
    const suggested = `${colour ? `${colour} ` : ''}${TOOL_NAME[tool].toLowerCase()}`.replace(/^./, c => c.toUpperCase());
    const name = (window.prompt('Name this tool, with its colours and sizes as they are now:', suggested) || '').trim();
    if (!name) return;
    app.prefs.favourites = [...(app.prefs.favourites || []), { id: newId(), tool, name: name.slice(0, 30), style }];
    app.savePrefs();
    app.ui.toast(`Saved. Find it under Symbols › Saved tools.`);
  }
  function useFavourite(f) {
    app.prefs.tools[f.tool] = { ...app.prefs.tools[f.tool], ...f.style };
    app.savePrefs();
    app.ui.closeSheet();
    app.setTool(f.tool);
  }
  function removeFavourite(id) {
    app.prefs.favourites = app.prefs.favourites.filter(f => f.id !== id);
    app.savePrefs();
    redraw();
  }

  // ---- your own stickers --------------------------------------------------
  async function addEntry(a, name, w, hh, group = MY_GROUP, extra = {}) {
    const e = { id: newId(), name, group, asset: a.id, w, h: hh, order: Date.now(), ...extra };
    lib.push(e);
    await store.putLibrary([e]).catch(err => console.warn('sticker not kept', err));
    return e;
  }

  /** Cut a box out of the page and keep it as a sticker. */
  async function snip(rect) {
    app.ui.hint(null);
    app.ui.busy('Cutting…');
    try {
      const pxPerPt = Math.min(16, Math.max(4, 1100 / Math.max(rect.w, rect.h)), 2048 / Math.max(rect.w, rect.h));
      const canvas = await app.viewer.renderRegion(app.doc.pageIndex, rect, pxPerPt);
      const a = await assets.fromCanvas(canvas);
      app.ui.busy(null);
      const n = lib.filter(e => (e.group || MY_GROUP) === MY_GROUP).length + 1;
      const name = (window.prompt('Name this sticker:', `Sticker ${n}`) || `Sticker ${n}`).trim().slice(0, 40);
      const e = await addEntry(a, name, rect.w, rect.h);
      Object.assign(stampPrefs(), { lib: e.id, scale: 1, rot: 0 });
      app.savePrefs();
      app.setTool('stamp');
      app.ui.toast(`${name} is in your tray. Tap to place it.`);
    } catch (err) {
      console.error(err);
      app.ui.busy(null);
      app.ui.alert('That did not work', 'The sticker could not be made from this page.');
    }
  }

  $('file-photo').addEventListener('change', async ev => {
    const f = ev.target.files[0];
    ev.target.value = '';
    if (!f || !app.doc) return;
    app.ui.busy('Adding picture…');
    try {
      const a = await assets.fromFile(f, { max: 1600, keepAlpha: true });
      const k = app.doc.pageInfo.k, w = 160 * k;
      // A photo or a logo keeps its own colours whichever way the switch is set.
      const e = await addEntry(a, f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Picture', w, (w * a.h) / a.w, MY_GROUP, { asDrawn: true });
      Object.assign(stampPrefs(), { lib: e.id, scale: 1, rot: 0 });
      app.savePrefs();
      app.ui.closeSheet();
      app.setTool('stamp');
      app.ui.toast('Tap where the picture goes');
    } catch (err) {
      console.error(err);
      app.ui.alert('That picture would not open', 'Try a JPEG or PNG.');
    } finally { app.ui.busy(null); }
  });

  // ---- symbol sets --------------------------------------------------------
  /** Put a symbol set (the contents of a .redlinekit file) into the tray. Returns the entries it made. */
  async function addKit(kit, fallbackName, extra = {}) {
    if (!kit || !Array.isArray(kit.symbols)) throw new Error('not a symbol set');
    const kitName = String(kit.name || fallbackName);
    const entries = [];
    let order = Date.now();
    for (const s of kit.symbols) {
      if (!s || !Array.isArray(s.items) || !(s.w > 0) || !(s.h > 0)) continue;
      const items = s.items.map(it => (it.t != null
        ? { t: 'text', s: String(it.t), x: it.x, y: it.y, size: it.z, color: it.c || '#000000' }
        : { d: typeof it.d === 'string' ? parsePath(it.d) : it.d, stroke: it.s || null, fill: it.f || null, w: it.w || 0.5, eo: it.eo ? 1 : 0, dash: it.dash || null }));
      const a = await assets.put({ id: assets.hashId('v', JSON.stringify([s.w, s.h, s.items])), kind: 'vec', w: s.w, h: s.h, items });
      entries.push({ id: `${kitName}:${s.key || s.name}`, name: String(s.name || 'Symbol'), tag: s.tag ? String(s.tag) : '', group: String(s.group || kitName), asset: a.id, w: s.w, h: s.h, order: order++, kit: kitName, ...extra });
    }
    if (!entries.length) throw new Error('empty');
    const ids = new Set(entries.map(e => e.id));
    // A newer copy of a set replaces the old one: symbols it no longer has leave the tray.
    const stale = lib.filter(e => e.kit === kitName && !ids.has(e.id)).map(e => e.id);
    lib = [...lib.filter(e => !ids.has(e.id) && !stale.includes(e.id)), ...entries];
    await store.putLibrary(entries);
    if (stale.length) await store.removeLibrary(stale).catch(() => {});
    return entries;
  }

  /**
   * The symbol set that comes with the app, if there is one (kits/built-in.redlinekit beside index.html).
   * It goes into the tray by itself the first time, and again whenever the app is updated with a newer one.
   */
  async function loadBuiltIn() {
    await ready;
    try {
      const r = await fetch('kits/built-in.redlinekit');
      if (!r.ok) return;
      const text = await r.text();
      const stamp = assets.hashId('k', text);
      const have = lib.some(e => e.builtIn);
      if (app.prefs.builtInKit === stamp && (have || app.prefs.builtInRemoved)) return;
      await addKit(JSON.parse(text), 'Legend', { builtIn: true });
      app.prefs.builtInKit = stamp;
      app.prefs.builtInRemoved = false;
      app.savePrefs();
      app.ui.refresh();
    } catch { /* no set comes with this copy of the app, or there is no signal and none is stored: nothing to do */ }
  }
  loadBuiltIn();

  /** Bring in a .redlinekit file: a set of drawn symbols, usually cut from a legend. */
  async function importFile(file) {
    app.ui.busy('Adding symbols…');
    try {
      const entries = await addKit(JSON.parse(await file.text()), file.name.replace(/\.[^.]+$/, ''));
      app.ui.busy(null);
      app.ui.toast(`${entries.length} symbols added from ${entries[0].kit}`);
      if (app.doc) open();
    } catch (err) {
      console.error(err);
      app.ui.busy(null);
      app.ui.alert('That is not a symbol set', 'Choose a .redlinekit file.');
    }
  }
  $('file-kit').addEventListener('change', ev => { const f = ev.target.files[0]; ev.target.value = ''; if (f) importFile(f); });

  // ---- signature ----------------------------------------------------------
  function sigThumb(s) {
    const w = 60, hh = Math.max(8, Math.min(40, 60 / s.aspect));
    const d = s.strokes.map(st => st.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * w).toFixed(1)} ${(p[1] * hh).toFixed(1)}`).join('')).join('');
    return `<svg viewBox="-2 -2 ${w + 4} ${hh + 4}" width="64" height="44" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function signaturePad() {
    const canvas = h('canvas', { class: 'sigpad', width: 1000, height: 400 });
    const ctx = canvas.getContext('2d');
    let strokes = [], cur = null;
    const paint = () => {
      ctx.clearRect(0, 0, 1000, 400);
      ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
      for (const s of strokes) { ctx.beginPath(); s.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]); ctx.stroke(); }
    };
    const at = ev => { const r = canvas.getBoundingClientRect(); return [((ev.clientX - r.left) / r.width) * 1000, ((ev.clientY - r.top) / r.height) * 400]; };
    canvas.addEventListener('pointerdown', ev => { ev.preventDefault(); try { canvas.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ } cur = [at(ev)]; strokes.push(cur); paint(); });
    canvas.addEventListener('pointermove', ev => { if (!cur) return; const evs = ev.getCoalescedEvents ? ev.getCoalescedEvents() : []; for (const e2 of evs.length ? evs : [ev]) cur.push(at(e2)); paint(); });
    const end = () => { cur = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    const save = () => {
      const pts = strokes.flat();
      if (pts.length < 4) return app.ui.toast('Sign in the box first');
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const x0 = Math.min(...xs), y0 = Math.min(...ys), bw = Math.max(1, Math.max(...xs) - x0), bh = Math.max(1, Math.max(...ys) - y0);
      // Thin the points out: a signature needs its shape, not every sample.
      const thin = s => s.filter((p, i) => i === 0 || i === s.length - 1 || Math.hypot(p[0] - s[i - 1][0], p[1] - s[i - 1][1]) > 2.5 || i % 3 === 0);
      app.prefs.signature = { aspect: bw / bh, strokes: strokes.map(s => thin(s).map(p => [Math.round(((p[0] - x0) / bw) * 1000) / 1000, Math.round(((p[1] - y0) / bh) * 1000) / 1000])) };
      app.savePrefs();
      app.ui.closeSheet();
      app.setTool('sig');
      app.ui.toast('Signature saved. Tap where it goes.');
    };
    app.ui.openSheet('Your signature', [
      h('p', { class: 'muted' }, 'Sign with a finger or the Pencil. It is kept on this device and placed wherever you tap.'),
      canvas,
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { strokes = []; paint(); } }, 'Clear'),
        h('button', { class: 'btn primary', onclick: save }, 'Save')),
    ]);
  }

  app.kit = { open, newStamp, newSignature, signaturePad, snip, currentButton, canTint, currentCanTint, currentTint, markupTint, rememberColour, modeSwitch, addFavourite, importFile, entries: () => lib, ready };
}
