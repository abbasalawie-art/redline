// On a PC (Chrome or Edge): open a PDF from its folder and save straight back into the same file.
// Browsers without this (Safari on the iPad) keep using the file picker and Export.

const TYPES = [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }];

export function initFiles(app) {
  const canPick = typeof window.showOpenFilePicker === 'function' && typeof window.showSaveFilePicker === 'function';
  const picker = () => document.getElementById('file').click();

  /** Open the file behind a handle, remembering the handle so Save can write to it. */
  async function openHandle(handle) {
    const file = await handle.getFile();
    await app.openBytes(file.name, new Uint8Array(await file.arrayBuffer()), { handle, modified: file.lastModified });
    if (app.doc && app.doc.handle === handle) { app.doc.fileTime = file.lastModified; app.saveNow(); }
  }

  async function openPicker() {
    if (!canPick) return picker();
    let handle;
    try { [handle] = await window.showOpenFilePicker({ types: TYPES, multiple: false }); }
    catch (e) { if (e && e.name === 'AbortError') return; return picker(); }
    try { await openHandle(handle); }
    catch (e) { console.error(e); app.ui.alert('That file would not open', 'It may have been moved, or the browser was not allowed to read it.'); }
  }

  /** May we write to this file? The browser asks the first time, and again after a restart. */
  async function allowed(handle) {
    if (!handle.queryPermission) return true;
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  let saving = false;
  /** Write the drawing, with its markups still editable, into its own file. `as` asks where. */
  async function save({ as = false } = {}) {
    const doc = app.doc;
    if (!doc || saving) return;
    if (app.editing) app.commitEdit();
    app.tools.cancelPending();
    if (!canPick) return app.ui.exportSheet();
    if (!doc.writable) return app.ui.alert('This PDF cannot be saved to', 'Redline can show this file but cannot write markups into it. Try re-saving it from Revu or printing it to a new PDF first.');
    saving = true;
    try {
      let handle = as ? null : doc.handle;
      if (handle) {
        if (!(await allowed(handle))) return app.ui.toast('Not saved: the browser was not allowed to write to that file');
        // Has someone else changed the file since it was opened here (the iPad, Revu, a colleague)?
        const now = await handle.getFile().catch(() => null);
        if (now && doc.fileTime && now.lastModified !== doc.fileTime && now.size !== doc.srcSize) {
          const pick = await app.ui.choose('The file has changed since you opened it',
            `${handle.name} was changed somewhere else, perhaps on another device. Saving now replaces that version with yours.`,
            ['Save over it', 'Save as a new file', 'Cancel']);
          if (pick === 1) handle = null; else if (pick !== 0) return;
        }
      }
      if (!handle) {
        try { handle = await window.showSaveFilePicker({ suggestedName: doc.name, types: TYPES }); }
        catch (e) { if (e && e.name === 'AbortError') return; throw e; }
      }
      app.ui.busy('Saving…');
      const bytes = await app.buildPdf({});
      const w = await handle.createWritable();
      await w.write(bytes);
      await w.close();
      if (app.doc !== doc) return;
      doc.handle = handle;
      doc.name = handle.name;
      const written = await handle.getFile().catch(() => null);
      doc.fileTime = written ? written.lastModified : Date.now();
      app.markSaved(bytes.length);
      app.ui.toast(`Saved to ${handle.name}`);
    } catch (e) {
      console.error(e);
      app.ui.busy(null);
      app.ui.alert('That did not save', 'The file may be open in another program (Revu locks a PDF while it has it open), or the folder may not allow changes. Close it there, or use Save as.');
    } finally { saving = false; app.ui.busy(null); }
  }

  // Installed on a PC, Redline can be chosen under "Open with" for a PDF: the file arrives here.
  if ('launchQueue' in window && window.launchQueue.setConsumer) {
    window.launchQueue.setConsumer(params => {
      const handle = params.files && params.files[0];
      if (handle) openHandle(handle).catch(e => { console.error(e); app.ui.alert('That file would not open', 'The browser could not read it.'); });
    });
  }

  app.files = { canPick, openPicker, openHandle, save };
}
