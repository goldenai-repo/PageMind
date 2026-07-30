import type { LibraryBook } from "./books";

const DB_NAME = "pagemind";
const DB_VERSION = 2;
const STORE = "books";
export const TIPS_STORE = "tips";

/**
 * The `books` store now caches downloaded file bytes for shared-library
 * books. Records written before the shared library existed hold a full
 * book (`data` field) — those are read via loadLegacyBooks() and uploaded
 * to the shared library on first load, then deleted.
 */
type CachedBytes = { id: string; bytes: ArrayBuffer; cachedAt: string };

type LegacyStoredBook = Omit<LibraryBook, "addedAt"> & { addedAt: string };

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(TIPS_STORE)) {
        const tips = db.createObjectStore(TIPS_STORE, { keyPath: "id" });
        tips.createIndex("bookId", "bookId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCachedBookBytes(
  id: string,
): Promise<ArrayBuffer | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => {
      const record = req.result as CachedBytes | undefined;
      resolve(record?.bytes instanceof ArrayBuffer ? record.bytes : null);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveCachedBookBytes(
  id: string,
  bytes: ArrayBuffer,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const record: CachedBytes = {
      id,
      bytes,
      cachedAt: new Date().toISOString(),
    };
    const req = tx.objectStore(STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Books saved locally before the shared library existed. */
export async function loadLegacyBooks(): Promise<LibraryBook[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const records = req.result as (LegacyStoredBook | CachedBytes)[];
      resolve(
        records
          .filter((r): r is LegacyStoredBook => "data" in r)
          .map((r) => ({ ...r, addedAt: new Date(r.addedAt) }))
          .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime()),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBookRecord(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
