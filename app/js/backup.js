// Backup and restore: every drawing, photo and symbol on this device in one file.
// The file is an ordinary zip: the drawings inside are plain PDFs, the markups and settings are in backup.json.
import * as store from './store.js';
import { zipParts, unzip } from './office.js';

export function initBackup(app) {
  const { h } = app.ui;
  const pick = h('input', { type: 'file', hidden: true });
  document.body.append(pick);

  async function make() {
    app.ui.closeSheet();
    app.ui.busy('Packing everything…');
    try {
      app.saveNow();
      const docs = await store.listDocs(), files = [], meta = {
        redlineBackup: 1, made: new Date().toISOString(), app: app.version, docs: [], assets: {},
        library: await store.listLibrary(), prefs: { ...app.prefs, lastDoc: null },
      };
      for (const d of docs) {
        const buf = await store.loadFile(d.id);
        if (!buf) continue;
        const { handle, ...plain } = d;           // a link to a file on this PC means nothing anywhere else
        meta.docs.push(plain);
        files.push({ name: `drawings/${d.id}.pdf`, data: new Uint8Array(buf) });
      }
      let pictures = 0;
      for (const id of await store.assetKeys()) {
        const a = await store.getAsset(id);
        if (!a) continue;
        if (a.kind === 'vec') meta.assets[id] = { kind: 'vec', w: a.w, h: a.h, items: a.items };
        else { meta.assets[id] = { kind: 'img', mime: a.mime, w: a.w, h: a.h, alpha: !!a.alpha }; files.push({ name: `pictures/${id}`, data: a.bytes }); pictures++; }
      }
      files.unshift({ name: 'backup.json', data: JSON.stringify(meta) });
      const blob = new Blob(zipParts(files), { type: 'application/zip' });
      const stamp = new Date().toISOString().slice(0, 10);
      app.ui.busy(null);
      app.ui.deliver(blob, `Redline backup ${stamp}.zip`, 'application/zip',
        `${meta.docs.length} ${meta.docs.length === 1 ? 'drawing with its markups' : 'drawings with their markups'},${pictures} ${pictures === 1 ? 'photo or picture' : 'photos and pictures'}, ${meta.library.length} tray symbols and your settings. Save it to OneDrive.`);
    } catch (e) {
      console.error(e);
      app.ui.busy(null);
      app.ui.alert('The backup did not build', 'There may not be enough free memory for everything at once. Remove drawings you no longer need from Files and try again.');
    }
  }

  /** Bring a backup in. It only adds and updates: nothing on this device is deleted. */
  async function restore(file) {
    app.ui.busy('Reading the backup…');
    try {
      const entries = unzip(new Uint8Array(await file.arrayBuffer()));
      const head = entries.get('backup.json');
      const meta = head ? JSON.parse(new TextDecoder().decode(head)) : null;
      if (!meta || meta.redlineBackup !== 1) throw new Error('not a Redline backup');

      const haveAssets = new Set(await store.assetKeys());
      for (const [id, a] of Object.entries(meta.assets || {})) {
        if (haveAssets.has(id)) continue;
        if (a.kind === 'vec') await store.putAsset({ id, kind: 'vec', w: a.w, h: a.h, items: a.items });
        else { const bytes = entries.get(`pictures/${id}`); if (bytes) await store.putAsset({ id, kind: 'img', mime: a.mime, w: a.w, h: a.h, alpha: !!a.alpha, bytes: bytes.slice() }); }
      }

      const mine = new Map((await store.listDocs()).map(d => [d.id, d]));
      let added = 0, updated = 0, kept = 0;
      for (const d of meta.docs || []) {
        const pdf = entries.get(`drawings/${d.id}.pdf`), have = mine.get(d.id);
        if (!pdf) continue;
        if (have && (have.updated || 0) >= (d.updated || 0)) { kept++; continue; }
        await store.saveFile(d.id, pdf.slice().buffer);
        await store.saveDoc(have && have.handle ? { ...d, handle: have.handle } : d);
        if (have) updated++; else added++;
      }

      const haveLib = new Set((await store.listLibrary()).map(e => e.id));
      const newLib = (meta.library || []).filter(e => !haveLib.has(e.id));
      if (newLib.length) await store.putLibrary(newLib);

      // Settings: fill in what is missing here, never overwrite what is set.
      const p = meta.prefs || {}, q = app.prefs;
      if (!q.author && p.author) q.author = p.author;
      if (!q.signature && p.signature) q.signature = p.signature;
      q.favourites = [...(q.favourites || []), ...(p.favourites || []).filter(f => !(q.favourites || []).some(x => x.id === f.id))];
      q.stamps = [...new Set([...(q.stamps || []), ...(p.stamps || [])])];
      if (p.report) q.report = { ...p.report, ...Object.fromEntries(Object.entries(q.report || {}).filter(([, v]) => v)) };
      app.savePrefs();

      await app.kit.reload();
      const open = app.doc && (meta.docs || []).find(d => d.id === app.doc.id);
      app.ui.busy(null);
      if (open && mine.get(open.id) && (mine.get(open.id).updated || 0) < (open.updated || 0)) await app.openStored(open.id);
      else if (!app.doc) app.ui.showHome(true);
      const bits = [`${added} ${added === 1 ? 'drawing' : 'drawings'} added`];
      if (updated) bits.push(`${updated} updated`);
      if (kept) bits.push(`${kept} already up to date`);
      if (newLib.length) bits.push(`${newLib.length} tray symbols added`);
      app.ui.alert('Backup restored', `${bits.join(', ')}. Nothing on this device was removed.`);
    } catch (e) {
      console.error(e);
      app.ui.busy(null);
      app.ui.alert('That backup would not open', 'Choose a "Redline backup … .zip" file made by this app. If iOS unpacked it into a folder, pick the original zip instead.');
    }
  }
  pick.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) { app.ui.closeSheet(); restore(f); } });

  async function open() {
    let size = '';
    try { const est = await navigator.storage.estimate(); size = ` About ${(est.usage / 1048576).toFixed(0)} MB is stored here now.`; } catch { /* not available */ }
    app.ui.openSheet('Back up or restore', [
      h('p', {}, 'Everything in Redline lives on this device only. A backup puts every drawing, markup, photo, tray symbol and setting into one file.'),
      h('button', { class: 'choice', onclick: make }, h('b', {}, 'Make a backup'), h('span', {}, `Then save the file to OneDrive.${size}`)),
      h('button', { class: 'choice', onclick: () => pick.click() }, h('b', {}, 'Restore from a backup'), h('span', {}, 'Adds what is missing and updates drawings that are newer in the backup. Nothing here is deleted. Also the way to move everything to another device.')),
    ]);
  }

  app.backup = { open, make, restore };
}
