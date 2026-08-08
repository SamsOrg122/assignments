"use client";

/**
 * Where the heavy parts of the kit live.
 *
 * Everything else in this app persists to `localStorage`, which is the right
 * call for documents: small, synchronous, and the same store the whole
 * workspace already shares. It is the wrong call for a font. A single woff2 is
 * 30–200 KB, a TTF can be half a megabyte, and the *entire* localStorage quota
 * is five to ten — so two typefaces would push somebody's thesis out of the
 * browser.
 *
 * So the kit's bytes go to IndexedDB, which is measured in hundreds of
 * megabytes, and only the *description* of each asset stays in the ordinary
 * store. Nothing else in the codebase has to know: `useKit` hands back an
 * asset, and its data arrives with it.
 *
 * Values are stored as data URLs rather than Blobs. A Blob is the tighter
 * representation, but the backup file is JSON and has to carry the kit too —
 * and a format that can't be exported is a format that loses someone's fonts
 * the first time they change browser.
 */

const DB = "assignments";
const STORE = "kit";
const VERSION = 1;

let cached: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (cached) return cached;
  cached = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser has no IndexedDB, so the kit can't hold files."));
      return;
    }
    const request = indexedDB.open(DB, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Couldn't open local storage."));
    // Another tab is holding an older version open. Rare, and recoverable by
    // reloading — but it must not hang forever waiting.
    request.onblocked = () =>
      reject(new Error("Another tab is using an older version. Reload and retry."));
  });
  // A failed open must not be cached forever: the next call should try again.
  cached.catch(() => {
    cached = null;
  });
  return cached;
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = work(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("The kit couldn't be read."));
      }),
  );
}

export function putBlob(id: string, dataUrl: string): Promise<void> {
  return run("readwrite", (store) => store.put(dataUrl, id)).then(() => undefined);
}

export function getBlob(id: string): Promise<string | null> {
  return run<string | undefined>("readonly", (store) => store.get(id)).then(
    (value) => value ?? null,
  );
}

export function deleteBlob(id: string): Promise<void> {
  return run("readwrite", (store) => store.delete(id)).then(() => undefined);
}

/** Every stored payload, for the backup file. */
export async function allBlobs(): Promise<Record<string, string>> {
  const keys = await run<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
  const values = await run<string[]>("readonly", (store) => store.getAll());
  const out: Record<string, string> = {};
  keys.forEach((key, i) => {
    out[String(key)] = values[i];
  });
  return out;
}

/** Put a whole set back, replacing what's there. Used by a restore. */
export async function replaceBlobs(entries: Record<string, string>): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    store.clear();
    for (const [id, value] of Object.entries(entries)) store.put(value, id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("The kit couldn't be restored."));
  });
}
