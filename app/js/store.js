// What stays on the device: recent documents (with their markups) and preferences.
const DB_NAME = 'redline', DB_VERSION = 2;
let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = e => {
      const d = r.result;
      if (e.oldVersion < 1) {
        d.createObjectStore('docs', { keyPath: 'id' });        // name, pages, markups, last page…
        d.createObjectStore('files');                           // the PDF bytes, by doc id
      }
      if (e.oldVersion < 2) {
        d.createObjectStore('assets', { keyPath: 'id' });      // pictures and symbol drawings that markups use
        d.createObjectStore('library', { keyPath: 'id' });     // the symbols tray: name, group, which asset
      }
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

async function run(stores, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(stores, mode);
    let out;
    const req = fn(t);
    if (req) req.onsuccess = () => { out = req.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export const listDocs = async () =>
  ((await run(['docs'], 'readonly', t => t.objectStore('docs').getAll())) || []).sort((a, b) => b.updated - a.updated);
export const getDoc = id => run(['docs'], 'readonly', t => t.objectStore('docs').get(id));
export const saveDoc = meta => run(['docs'], 'readwrite', t => { t.objectStore('docs').put(meta); });
export const loadFile = id => run(['files'], 'readonly', t => t.objectStore('files').get(id));
export const saveFile = (id, buffer) => run(['files'], 'readwrite', t => { t.objectStore('files').put(buffer, id); });
export const removeDoc = id => run(['docs', 'files'], 'readwrite', t => {
  t.objectStore('docs').delete(id);
  t.objectStore('files').delete(id);
});

// ---- pictures, symbols and the tray ---------------------------------------
export const getAsset = id => run(['assets'], 'readonly', t => t.objectStore('assets').get(id));
export const putAsset = a => run(['assets'], 'readwrite', t => { t.objectStore('assets').put(a); });
export const assetKeys = () => run(['assets'], 'readonly', t => t.objectStore('assets').getAllKeys());
export const deleteAssets = ids => run(['assets'], 'readwrite', t => { for (const id of ids) t.objectStore('assets').delete(id); });
export const listLibrary = async () => (await run(['library'], 'readonly', t => t.objectStore('library').getAll())) || [];
export const putLibrary = entries => run(['library'], 'readwrite', t => { for (const e of entries) t.objectStore('library').put(e); });
export const removeLibrary = ids => run(['library'], 'readwrite', t => { for (const id of ids) t.objectStore('library').delete(id); });

/** Ask the browser not to clear our storage when the device runs low. */
export async function keepStorage() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch { /* optional */ }
}

const PREFS_KEY = 'redline.prefs';
export function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
}
export function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
