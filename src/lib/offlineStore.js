/**
 * Offline (2026-10-19): what the app keeps on the device so it works with no
 * connection.
 *
 * Two things, in IndexedDB rather than localStorage — a few thousand
 * questions is megabytes, past what localStorage reliably holds:
 *
 *   snapshots  everything loadAll returns, for the signed-in account, kept up
 *              to date with what you do (App.jsx saves it as the state
 *              changes), so the app opens from it at once and works from it
 *              when the server cannot be reached.
 *   images     question images, which live in a private bucket behind links
 *              that expire — so the image itself is kept, not the link.
 *
 * This is the one deliberate exception to "the browser holds nothing": the
 * server is still the truth. This copy is only ever read into the screen and
 * never written back over the server; what you do offline reaches the server
 * through the write queue (lib/remote), as before. One account's copy at a
 * time, and all of it is wiped on sign-out.
 *
 * Every call fails soft: no IndexedDB (a private window in some browsers,
 * storage full) means no offline copy, never a broken app.
 */
const DB = "resurface-offline";
const VERSION = 1;
export const SNAPSHOT_VERSION = 1;

let dbPromise = null;
function db() {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("no indexedDB"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("snapshots")) d.createObjectStore("snapshots");
        if (!d.objectStoreNames.contains("images")) d.createObjectStore("images");
      };
      req.onsuccess = () => {
        const d = req.result;
        /* Another tab upgrading the database closes this connection. */
        d.onversionchange = () => { d.close(); dbPromise = null; };
        resolve(d);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("blocked"));
    }).catch(e => { dbPromise = null; throw e; });
  }
  return dbPromise;
}

function run(store, mode, fn) {
  return db().then(d => new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    let out;
    Promise.resolve(fn(tx.objectStore(store))).then(r => { out = r; });
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}
const req2p = r => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

/* ── Snapshots ─────────────────────────────────────────────────────── */

export async function readSnapshot(userId) {
  if (!userId) return null;
  try {
    const row = await run("snapshots", "readonly", s => req2p(s.get(userId)));
    if (!row || row.v !== SNAPSHOT_VERSION || row.userId !== userId || !row.data) return null;
    return row;
  } catch { return null; }
}

/* Only one account's copy is ever kept: saving yours removes any other. */
export async function saveSnapshot(userId, data) {
  if (!userId || !data) return false;
  try {
    await run("snapshots", "readwrite", async s => {
      const keys = await req2p(s.getAllKeys());
      for (const k of keys) if (k !== userId) s.delete(k);
      s.put({ v: SNAPSHOT_VERSION, userId, savedAt: Date.now(), data }, userId);
    });
    return true;
  } catch { return false; }
}

/* ── Question images ───────────────────────────────────────────────── */

export async function readImage(path) {
  try { return (await run("images", "readonly", s => req2p(s.get(path))))?.blob ?? null; }
  catch { return null; }
}

export async function hasImage(path) {
  try { return (await run("images", "readonly", s => req2p(s.count(path)))) > 0; }
  catch { return false; }
}

export async function saveImage(path, blob) {
  try { await run("images", "readwrite", s => { s.put({ blob, at: Date.now() }, path); }); return true; }
  catch { return false; }
}

export async function deleteImage(path) {
  try { await run("images", "readwrite", s => { s.delete(path); }); } catch { /* nothing kept */ }
}

/* ── Sign-out ──────────────────────────────────────────────────────── */

export async function clearOffline() {
  try {
    await run("snapshots", "readwrite", s => { s.clear(); });
    await run("images", "readwrite", s => { s.clear(); });
  } catch { /* nothing kept */ }
}
