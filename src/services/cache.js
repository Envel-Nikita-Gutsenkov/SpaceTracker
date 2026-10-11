// Shared persistence layer for offline resilience.
//
// Values are stored in IndexedDB so they survive reloads. When IndexedDB is
// unavailable (private mode, blocked storage, non-browser test runs) we fall
// back to an in-process Map so callers never have to special-case storage.
//
// v13: bumped from v12 so a catalogue cached before the extra CelesTrak groups were added
// (gnss, last-30-days, Kuiper/Qianfan/GuoWang, GEO operators) is discarded on upgrade —
// otherwise a stale snapshot keeps the new categories empty for its full TTL.
// v12 (from v11): the OMM/JSON migration, which preserves the 6-digit NORAD IDs that the
// old TLE/3LE endpoint cannot represent; a stale v11 cache would keep serving the
// incomplete pre-migration catalogue for its full TTL.
const DB_NAME = 'space-tracker-v13';
const STORE   = 'cache';

let dbPromise = null;
const memory = new Map();

function hasIDB() {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  }).catch((err) => {
    // Allow a later retry to re-open a fresh connection.
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function run(db, mode, action) {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE, mode);
    const req = action(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

export async function cacheGet(key) {
  if (!hasIDB()) return memory.has(key) ? memory.get(key) : null;
  try {
    const db = await openDB();
    return (await run(db, 'readonly', (store) => store.get(key))) ?? null;
  } catch (_) {
    return memory.has(key) ? memory.get(key) : null;
  }
}

export async function cacheSet(key, value) {
  if (!hasIDB()) { memory.set(key, value); return; }
  try {
    const db = await openDB();
    await run(db, 'readwrite', (store) => store.put(value, key));
  } catch (_) {
    memory.set(key, value);
  }
}

export async function cacheClear() {
  memory.clear();
  if (!hasIDB()) return;
  try {
    const db = await openDB();
    await run(db, 'readwrite', (store) => store.clear());
  } catch (_) {}
}
