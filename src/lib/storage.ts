import {
  normalizeLibraryBook,
  removeFromMyLibrary,
  type BookRating,
  type LibraryBook,
  type ReadingProgressUpdate,
} from "./books";

const DB_PREFIX = "pagemind";
/** v2: rating / progress / locator fields (embedded on the same store). */
const DB_VERSION = 2;
const STORE = "books";

type StoredBook = Omit<LibraryBook, "addedAt" | "lastOpenedAt"> & {
  addedAt: string;
  lastOpenedAt?: string | null;
};

function dbName(userId: string) {
  return `${DB_PREFIX}_${userId}`;
}

function openDB(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(userId), DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      // Field defaults are applied on read via normalizeLibraryBook — no
      // per-row rewrite needed for v1 → v2.
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
  const db = await openDB(userId);
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

export async function loadBooks(userId: string): Promise<LibraryBook[]> {
  const db = await openDB(userId);
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
  const db = await openDB(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(toStored(book));
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Permanently removes the catalog row + file bytes.
 * Not used by bookshelf UI (users cannot delete from All Books).
 */
export async function deleteBook(userId: string, id: string): Promise<void> {
  const db = await openDB(userId);
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
