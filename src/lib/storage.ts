import {
  normalizeLibraryBook,
  removeFromMyLibrary,
  type BookRating,
  type LibraryBook,
  type ReadingProgressUpdate,
} from "./books";

/**
 * Shared IndexedDB (`pagemind`) caches downloaded shared-library bytes + tips.
 * Per-user DBs (`pagemind_{userId}`) still hold the Phase-1 local bookshelf
 * (full book records with progress / rating) used by /library UI.
 */
const SHARED_DB_NAME = "pagemind";
const DB_PREFIX = "pagemind";
const DB_VERSION = 2;
const STORE = "books";
export const TIPS_STORE = "tips";

type StoredBook = Omit<LibraryBook, "addedAt" | "lastOpenedAt"> & {
  addedAt: string;
  lastOpenedAt?: string | null;
};

/**
 * The shared `books` store caches downloaded file bytes for shared-library
 * books. Records written before the shared library existed hold a full
 * book (`data` field) — those are read via loadLegacyBooks() and uploaded
 * to the shared library on first load, then deleted.
 */
type CachedBytes = { id: string; bytes: ArrayBuffer; cachedAt: string };

type LegacyStoredBook = Omit<LibraryBook, "addedAt"> & { addedAt: string };

function userDbName(userId: string) {
  return `${DB_PREFIX}_${userId}`;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SHARED_DB_NAME, DB_VERSION);
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

function openUserDB(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(userDbName(userId), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fromStored(r: StoredBook): LibraryBook {
  return normalizeLibraryBook({
    ...r,
    addedAt: new Date(r.addedAt),
    lastOpenedAt: r.lastOpenedAt ? new Date(r.lastOpenedAt) : null,
  });
}

function toStored(book: LibraryBook): StoredBook {
  const normalized = normalizeLibraryBook(book);
  return {
    ...normalized,
    addedAt: normalized.addedAt.toISOString(),
    lastOpenedAt: normalized.lastOpenedAt
      ? normalized.lastOpenedAt.toISOString()
      : null,
  };
}

async function getBook(
  userId: string,
  bookId: string,
): Promise<LibraryBook | null> {
  const db = await openUserDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(bookId);
    req.onsuccess = () => {
      const row = req.result as StoredBook | undefined;
      resolve(row ? fromStored(row) : null);
    };
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

/** Phase-1 /library UI: list full books from the per-user IndexedDB. */
export async function loadBooks(userId: string): Promise<LibraryBook[]> {
  const db = await openUserDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const records = req.result as StoredBook[];
      resolve(
        records
          .map(fromStored)
          .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime()),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveBook(
  userId: string,
  book: LibraryBook,
): Promise<void> {
  const db = await openUserDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(toStored(book));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Permanently removes a per-user catalog row + file bytes.
 * Used by Upload page temporary delete (not Home soft-delete).
 */
export async function deleteBook(userId: string, id: string): Promise<void> {
  const db = await openUserDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function setLibraryMembership(
  userId: string,
  bookId: string,
  inLibrary: boolean,
): Promise<LibraryBook | null> {
  const book = await getBook(userId, bookId);
  if (!book) return null;
  const updated = inLibrary
    ? { ...book, inMyLibrary: true }
    : removeFromMyLibrary(book);
  await saveBook(userId, updated);
  return updated;
}

export async function setFavorite(
  userId: string,
  bookId: string,
  favorite: boolean,
): Promise<LibraryBook | null> {
  const book = await getBook(userId, bookId);
  if (!book) return null;
  const updated: LibraryBook = {
    ...book,
    favorite,
    ...(favorite ? { inMyLibrary: true } : {}),
  };
  await saveBook(userId, updated);
  return updated;
}

export async function setRating(
  userId: string,
  bookId: string,
  rating: BookRating,
): Promise<LibraryBook | null> {
  const book = await getBook(userId, bookId);
  if (!book) return null;
  const updated: LibraryBook = { ...book, rating };
  await saveBook(userId, updated);
  return updated;
}

export async function updateProgress(
  userId: string,
  bookId: string,
  progress: ReadingProgressUpdate,
): Promise<LibraryBook | null> {
  const book = await getBook(userId, bookId);
  if (!book) return null;
  const updated: LibraryBook = {
    ...book,
    inMyLibrary: true,
    lastReadPage: progress.lastReadPage,
    totalPages: progress.totalPages,
    progressPercent: progress.progressPercent,
    locator: progress.locator,
    lastOpenedAt: new Date(),
    ...(progress.progressPercent >= 100 ? { status: "finished" as const } : {}),
  };
  await saveBook(userId, updated);
  return updated;
}
