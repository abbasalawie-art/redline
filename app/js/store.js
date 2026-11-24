// What stays on the device: recent documents (with their markups) and preferences.
const DB_NAME = 'redline', DB_VERSION = 1;
let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('docs', { keyPath: 'id' });   // name, pages, markups, last page…
      r.result.createObjectStore('files');                      // the PDF bytes, by doc id
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
