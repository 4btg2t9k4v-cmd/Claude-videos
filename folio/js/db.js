// Minimal promise wrapper around IndexedDB.
const DB_NAME = 'study-notebook';
const DB_VERSION = 1;
export const STORES = ['notebooks', 'pages', 'decks', 'cards', 'quizzes', 'templates', 'versions', 'kv'];

let dbp;
export function openDB() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const os = db.createObjectStore(s, { keyPath: 'id' });
          if (s === 'versions') os.createIndex('pageId', 'pageId');
        }
      }
    };
    r.onsuccess = () => {
      const db = r.result;
      db.onversionchange = () => db.close();
      res(db);
    };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Database blocked by another tab'));
  });
  return dbp;
}

function tx(store, mode, fn) {
  return openDB().then((db) => new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const os = t.objectStore(store);
    let out;
    Promise.resolve(fn(os)).then((v) => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transaction aborted'));
  }));
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const idb = {
  all: (store) => tx(store, 'readonly', (os) => req(os.getAll())),
  get: (store, id) => tx(store, 'readonly', (os) => req(os.get(id))),
  put: (store, obj) => tx(store, 'readwrite', (os) => { os.put(obj); }),
  putMany: (store, objs) => tx(store, 'readwrite', (os) => { for (const o of objs) os.put(o); }),
  del: (store, id) => tx(store, 'readwrite', (os) => { os.delete(id); }),
  delMany: (store, ids) => tx(store, 'readwrite', (os) => { for (const id of ids) os.delete(id); }),
  clear: (store) => tx(store, 'readwrite', (os) => { os.clear(); }),
  byIndex: (store, index, key) => tx(store, 'readonly', (os) => req(os.index(index).getAll(key))),
};
