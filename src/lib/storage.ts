import type { LibraryBook } from "./books";

const DB_NAME = "pagemind";
const DB_VERSION = 1;
const STORE = "books";

type StoredBook = Omit<LibraryBook, "addedAt"> & { addedAt: string };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadBooks(): Promise<LibraryBook[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const records = req.result as StoredBook[];
      resolve(
        records
          .map((r) => ({ ...r, addedAt: new Date(r.addedAt) }))
          .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime()),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveBook(book: LibraryBook): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const stored: StoredBook = { ...book, addedAt: book.addedAt.toISOString() };
    const req = tx.objectStore(STORE).put(stored);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
