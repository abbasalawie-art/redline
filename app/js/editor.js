// Typing into a text box: a real text field laid exactly over the markup.
import { layoutText, textPad } from './shapes.js';
import { LINE_HEIGHT } from './text.js';

export function initEditor(app) {
  const ta = app.el.editor;
  let cur = null;       // { m, isNew, before, prevView }
  const coarse = () => window.matchMedia('(pointer: coarse)').matches;

  function position() {
    if (!cur) return;
    const m = cur.m, v = app.viewer.view;
    const tb = layoutText(m, app.font), pad = textPad(m);
    // iOS zooms the whole page if a focused field's font is under 16 px, so the field is
    // always laid out at 16 px or more and shrunk with a transform when zoomed out.
    const S = Math.max(v.scale, 16 / m.fontSize);
    const inner = m.box.w != null ? m.box.w - 2 * pad : m.fontSize * 18;
    const at = app.viewer.toStage(tb.x, tb.y);
    Object.assign(ta.style, {
      fontSize: `${m.fontSize * S}px`,
      lineHeight: String(LINE_HEIGHT),
      padding: `${pad * S}px`,
      width: `${(inner + 2 * pad) * S + 2}px`,
      height: `${(tb.h + tb.lh) * S}px`,
      color: m.textColor,
      transform: `translate(${at.x}px, ${at.y}px) scale(${v.scale / S})`,
    });
  }

  /** On a touch screen, bring the text box to where the keyboard will not cover it. */
  function bringIntoView() {
    if (!coarse()) return;
    const m = cur.m, v = app.viewer.view, st = app.el.stage.getBoundingClientRect();
    const tb = layoutText(m, app.font);
    const scale = Math.max(v.scale, 15 / m.fontSize);
    const at = app.viewer.toStage(tb.x, tb.y);
    const fine = scale === v.scale && at.x >= 12 && at.x <= st.width * 0.6 && at.y >= 12 && at.y + tb.h * v.scale <= st.height * 0.4;
    if (fine) return;
    cur.prevView = { ...v };
    app.viewer.setView({ scale, tx: st.width * 0.16 - tb.x * scale, ty: st.height * 0.18 - tb.y * scale }, { settle: true });
  }

  app.startEdit = (m, isNew = false) => {
    if (cur) app.commitEdit();
    if (!isNew) app.pushUndo();
    cur = { m, isNew, before: m.text || '', prevView: null };
    app.editing = m.id;
    ta.value = m.text || '';
    bringIntoView();
    ta.style.display = 'block';
    position();
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
    app.renderOne(m);
    app.renderSelection();
    app.ui.refresh();
  };

  app.commitEdit = () => {
    if (!cur) return;
    const { m, isNew, before, prevView } = cur;
    cur = null;
    app.editing = null;
    ta.blur();
    ta.style.display = 'none';
    m.text = app.font.clean(ta.value).replace(/\s+$/, '');
    let removed = false;
    if (!m.text) {
      if (m.type === 'cloudplus') { m.type = 'cloud'; delete m.box; delete m.text; }
      else { app.markups = app.markups.filter(x => x.id !== m.id); if (app.sel === m.id) app.sel = null; removed = true; }
    }
    if ((isNew && removed) || (!isNew && m.text === before)) app.dropUndo();
    if (prevView) app.viewer.setView(prevView, { settle: true });
    window.scrollTo(0, 0);
    app.changed();
  };

  app.editorReposition = position;

  ta.addEventListener('input', () => {
    if (!cur) return;
    cur.m.text = ta.value;
    position();
    app.renderOne(cur.m);
    app.renderSelection();
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) { e.preventDefault(); app.commitEdit(); }
    e.stopPropagation();
  });
  ta.addEventListener('blur', () => { setTimeout(() => { if (cur && document.activeElement !== ta) app.commitEdit(); }, 0); });
}
