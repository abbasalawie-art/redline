// Keyboard shortcuts, matched to Bluebeam Revu's defaults wherever Redline has the same thing.
import { TEXT_TYPES } from './shapes.js';

const MEASURES = ['dim', 'path', 'area', 'count'];

/** "Ctrl+Shift+S" for a key press, in the order Ctrl, Alt, Shift. Layout-independent for letters and digits. */
export function comboOf(e) {
  const c = e.code || '';
  let k = null;
  if (/^Key[A-Z]$/.test(c)) k = c.slice(3);
  else if (/^Digit\d$/.test(c)) k = c.slice(5);
  else if (/^Numpad\d$/.test(c)) k = c.slice(6);
  else if (/^F\d{1,2}$/.test(c)) k = c;
  else {
    k = {
      Equal: '=', NumpadAdd: '=', Minus: '-', NumpadSubtract: '-', BracketLeft: '[', BracketRight: ']',
      ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Escape: 'Esc', Delete: 'Delete', Backspace: 'Backspace',
      Insert: 'Insert', Tab: 'Tab', Enter: 'Enter', NumpadEnter: 'Enter', PageDown: 'PageDown', PageUp: 'PageUp', Home: 'Home', End: 'End',
    }[c] || null;
  }
  if (!k && e.key && e.key.length === 1) k = e.key.toUpperCase();
  if (!k) return null;
  return `${e.ctrlKey || e.metaKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.shiftKey ? 'Shift+' : ''}${k}`;
}

export function initKeys(app) {
  const { h } = app.ui;
  const sheet = document.getElementById('sheet'), home = document.getElementById('home');
  const save = () => app.savePrefs();
  /** Pick a tool up, or put it down if it is already in hand. */
  const tool = (t, ready = () => true) => () => app.setTool(app.tool === t && ready() ? 'select' : t);
  const page = i => () => { if (i >= 0 && i < app.doc.pageCount && i !== app.doc.pageIndex) app.goPage(i); };
  const zoom = f => () => { const r = app.el.stage.getBoundingClientRect(); app.viewer.zoomAt(f, r.width / 2, r.height / 2); };

  function textTool(border) {
    const d = app.prefs.tools.text;
    if (app.tool === 'text' && !!d.border === border) return app.setTool('select');
    d.border = border; save();
    app.setTool('text');
  }
  function nudge(dx, dy, big) {
    const m = app.picked()[0];
    if (m) return app.nudge(dx * (big ? 10 : 1) * m.k, dy * (big ? 10 : 1) * m.k);
    const v = app.viewer.view;                                   // nothing selected: the arrows move the page
    app.viewer.setView({ tx: v.tx - dx * 60, ty: v.ty - dy * 60 }, { settle: true });
  }
  function editText() {
    const m = app.selected();
    if (m && TEXT_TYPES.has(m.type) && m.box) app.startEdit(m);
    else if (m && m.type === 'pin') app.pins.open(m);
  }
  function autosize() {
    const m = app.selected();
    if (!m || !m.box || m.box.w == null) return;
    app.pushUndo(); m.box.w = null; app.changed();
  }
  function nextMeasure() {
    const i = MEASURES.indexOf(app.tool);
    app.setTool(MEASURES[(i + 1) % MEASURES.length]);
  }
  async function flatten() {
    if (!app.doc.writable) return;
    app.ui.busy('Building PDF…');
    try { app.ui.deliver(await app.buildPdf({ flatten: true }), app.exportName('flattened'), 'application/pdf', 'Markups are part of the page and cannot be moved.'); }
    catch (e) { console.error(e); app.ui.alert('Export did not work', String((e && e.message) || e)); }
    finally { app.ui.busy(null); }
  }

  // [group, keys, what it does, action]. The list on screen (F1) is made from this same table.
  const DEFS = [
    ['Tools', ['V', 'Shift+V'], 'Select. Drag empty space to move the page', () => app.setTool('select')],
    ['Tools', ['Shift+O'], 'Lasso: draw a loop round markups to pick them', tool('lasso')],
    ['Tools', ['T'], 'Text box', () => textTool(true)],
    ['Tools', ['W'], 'Typewriter (text with no box)', () => textTool(false)],
    ['Tools', ['Q'], 'Callout', tool('callout')],
    ['Tools', ['C'], 'Cloud', tool('cloud')],
    ['Tools', ['K'], 'Cloud+', tool('cloudplus')],
    ['Tools', ['A'], 'Arrow', tool('arrow')],
    ['Tools', ['L'], 'Line', tool('line')],
    ['Tools', ['Shift+N'], 'Polyline', tool('polyline')],
    ['Tools', ['P'], 'Pen', tool('pen')],
    ['Tools', ['Shift+E'], 'Eraser, for pen and highlighter', tool('eraser')],
    ['Tools', ['H'], 'Highlight', tool('hl')],
    ['Tools', ['R'], 'Rectangle', tool('rect')],
    ['Tools', ['E'], 'Ellipse', tool('ellipse')],
    ['Tools', ['Shift+P'], 'Polygon', tool('polygon')],
    ['Tools', ['S'], 'Stamp: the Symbols tray', () => (app.tool === 'stamp' ? app.setTool('select') : app.kit.open())],
    ['Tools', ['I'], 'Image: bring in a picture', () => app.kit.picture()],
    ['Tools', ['N'], 'Note: a pin with a note and photo', tool('pin')],
    ['Tools', ['G'], 'Snapshot: cut a sticker from the page', tool('snip')],
    ['Tools', ['X'], 'Signature', tool('sig')],
    ['Tools', ['M'], 'Measure', () => (MEASURES.includes(app.tool) ? app.setTool('select') : app.setTool('dim'))],
    ['Tools', ['Shift+M'], 'Next measuring tool', nextMeasure],
    ['Tools', ['Alt+Shift+L', 'Shift+L'], 'Length', tool('dim')],
    ['Tools', ['Alt+Shift+Q'], 'Polylength: a cable run', tool('path')],
    ['Tools', ['Alt+Shift+A', 'Alt+Shift+P'], 'Area and perimeter', tool('area')],
    ['Tools', ['Alt+Shift+C'], 'Count', tool('count')],
    ['Tools', ['1', '2', '3', '4', '5', '6', '7', '8', '9'], 'Saved tool 1 to 9', null],
    ['Tools', ['Esc'], 'Put the tool down', () => { app.tools.cancelPending({ discard: true }); app.select(null); app.setTool('select'); }],

    ['Edit', ['Ctrl+Z'], 'Undo', () => app.undo()],
    ['Edit', ['Ctrl+Y', 'Ctrl+Shift+Z'], 'Redo', () => app.redo()],
    ['Edit', ['Ctrl+C', 'Ctrl+Insert'], 'Copy', () => app.copySelected()],
    ['Edit', ['Ctrl+X', 'Shift+Delete'], 'Cut', () => app.cutSelected()],
    ['Edit', ['Ctrl+V', 'Shift+Insert'], 'Paste in the middle of the screen', () => app.paste(false)],
    ['Edit', ['Ctrl+Shift+V'], 'Paste in place', () => app.paste(true)],
    ['Edit', ['Delete', 'Backspace'], 'Delete', () => app.deleteSelected()],
    ['Edit', ['Ctrl+A'], 'Select everything on the page', () => app.selectAll()],
    ['Edit', ['Shift+click'], 'Add a markup to what is picked, or take it out', null],
    ['Edit', ['Shift+drag'], 'Pick everything inside a box', null],
    ['Edit', ['Ctrl+G'], 'Group', () => app.group()],
    ['Edit', ['Ctrl+Shift+G'], 'Ungroup', () => app.ungroup()],
    ['Edit', ['Ctrl+Alt+L', 'Ctrl+Alt+R'], 'Align left, align right', null],
    ['Edit', ['Ctrl+Alt+T', 'Ctrl+Alt+B'], 'Align top, align bottom', null],
    ['Edit', ['Ctrl+Alt+E', 'Ctrl+Alt+M'], 'Align centre, align middle', null],
    ['Edit', ['Left', 'Right', 'Up', 'Down'], 'Nudge the selected markup (with Shift: further)', null],
    ['Edit', ['Tab'], 'Next markup', () => app.selectNext(1)],
    ['Edit', ['Shift+Tab'], 'Previous markup', () => app.selectNext(-1)],
    ['Edit', ['F2', 'Enter'], 'Edit the text', editText],
    ['Edit', ['Alt+Z'], 'Autosize the text box', autosize],
    ['Edit', ['Ctrl+]'], 'Bring forward', () => app.reorder('up')],
    ['Edit', ['Ctrl+['], 'Send backward', () => app.reorder('down')],
    ['Edit', ['Ctrl+Shift+]'], 'Bring to front', () => app.reorder('front')],
    ['Edit', ['Ctrl+Shift+['], 'Send to back', () => app.reorder('back')],

    ['File and pages', ['Ctrl+O'], 'Open', () => app.files.openPicker()],
    ['File and pages', ['Ctrl+S'], 'Save', () => app.files.save()],
    ['File and pages', ['Ctrl+Shift+S'], 'Save as', () => app.files.save({ as: true })],
    ['File and pages', ['Ctrl+P', 'Ctrl+E'], 'Export: to print, email or share', () => app.ui.exportSheet()],
    ['File and pages', ['Ctrl+Shift+M'], 'Flatten into a copy', flatten],
    ['File and pages', ['Ctrl+Shift+R', 'Alt+Shift+='], 'Rotate the page clockwise', () => app.pagesTool.turn(1)],
    ['File and pages', ['Alt+Shift+-'], 'Rotate the page anticlockwise', () => app.pagesTool.turn(3)],
    ['File and pages', ['Ctrl+Shift+N'], 'Insert a blank page', () => app.pagesTool.blank()],
    ['File and pages', ['Ctrl+Shift+I'], 'Insert pages from another PDF', () => app.pagesTool.addPdf()],
    ['File and pages', ['Ctrl+Shift+X'], 'Extract pages', () => app.pagesTool.extract()],
    ['File and pages', ['Ctrl+Shift+D'], 'Delete the page', () => app.pagesTool.remove()],
    ['File and pages', ['Ctrl+K'], 'Settings', () => app.ui.settingsSheet()],
    ['File and pages', ['F1'], 'This list', () => help()],

    ['View', ['Ctrl+9'], 'Fit page', () => app.viewer.fit()],
    ['View', ['Ctrl+0'], 'Fit width', () => app.viewer.fitWidth()],
    ['View', ['Ctrl+8'], 'Actual size', () => app.viewer.actualSize()],
    ['View', ['=', 'Shift+=', 'Ctrl+='], 'Zoom in', zoom(1.25)],
    ['View', ['-', 'Shift+-', 'Ctrl+-'], 'Zoom out', zoom(0.8)],
    ['View', ['PageDown', 'Ctrl+Right'], 'Next page', () => page(app.doc.pageIndex + 1)()],
    ['View', ['PageUp', 'Ctrl+Left'], 'Previous page', () => page(app.doc.pageIndex - 1)()],
    ['View', ['Home', 'Ctrl+Home'], 'First page', () => page(0)()],
    ['View', ['End', 'Ctrl+End'], 'Last page', () => page(app.doc.pageCount - 1)()],
    ['View', ['Ctrl+F', 'Alt+1'], 'Search', () => app.search.open()],
    ['View', ['F3'], 'Next match', () => app.search.step(1)],
    ['View', ['Shift+F3'], 'Previous match', () => app.search.step(-1)],
    ['View', ['Alt+L', 'Alt+U'], 'Markups list', () => app.report.open()],
    ['View', ['Alt+T'], 'Thumbnails: the Pages sheet', () => app.ui.pagesSheet()],
    ['View', ['Alt+X'], 'Tool Chest: the Symbols tray', () => app.kit.open()],
  ];
  const actions = new Map();
  for (const [, keys, , fn] of DEFS) if (fn) for (const k of keys) actions.set(k, fn);
  for (let i = 1; i <= 9; i++) actions.set(String(i), () => app.kit.favourite(i - 1));
  for (const [k, dx, dy] of [['Left', -1, 0], ['Right', 1, 0], ['Up', 0, -1], ['Down', 0, 1]]) {
    actions.set(k, () => nudge(dx, dy, false));
    actions.set(`Shift+${k}`, () => nudge(dx, dy, true));
  }
  actions.set('Ctrl+D', () => app.duplicateSelected());        // Redline's own: copy and paste in one
  for (const [k, how] of [['L', 'left'], ['R', 'right'], ['T', 'top'], ['B', 'bottom'], ['E', 'centre'], ['M', 'middle']]) actions.set(`Ctrl+Alt+${k}`, () => app.align(how));

  function help() {
    const body = [h('p', { class: 'muted' }, 'The same keys as Bluebeam Revu, for everything Redline also does. Pressing the key of the tool in hand puts it down.')];
    for (const group of [...new Set(DEFS.map(d => d[0]))]) {
      const t = h('table', { class: 'counts keys' });
      for (const [g, keys, what] of DEFS) if (g === group) t.append(h('tr', {}, h('td', {}, what), h('td', {}, keys.length > 4 ? `${keys[0]} … ${keys[keys.length - 1]}` : keys.join('   '))));
      body.push(h('h3', {}, group), t);
    }
    body.push(h('p', { class: 'muted small' }, 'A few of Revu\'s keys belong to the browser and stay with it: Ctrl+W, Ctrl+N, Ctrl+T, and in a browser tab Ctrl+Shift+N. Ctrl+D copies the selected markup.'));
    app.ui.openSheet('Keyboard shortcuts', body, { wide: true });
  }

  document.addEventListener('keydown', e => {
    const typing = e.target.closest && e.target.closest('input, textarea, select');
    const key = comboOf(e);
    if (!key) return;
    if (!sheet.hidden) {
      // A sheet is open: Esc closes it, F1 swaps to the list, everything else is for the sheet.
      if (key === 'Esc' && !typing) { e.preventDefault(); app.ui.closeSheet(); }
      return;
    }
    if (typing) return;
    if (key === 'F1') { e.preventDefault(); return help(); }
    if (key === 'Ctrl+O') { e.preventDefault(); return app.files.openPicker(); }
    if (!app.doc || !home.hidden) return;
    if (key === 'Enter' && app.tools.tapping) { e.preventDefault(); return app.tools.polyDone(); }
    const fn = actions.get(key);
    if (!fn) return;
    e.preventDefault();
    fn();
  });

  app.keys = { help, list: DEFS };
}
