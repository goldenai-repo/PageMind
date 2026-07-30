import {
  BOOK_MIME,
  type BookMeta,
  type BookMetaJson,
  type LibraryBook,
  type ShelfEntry,
} from "./books";
import { decodeText } from "./readers/decode-text";
import {
  deleteBookRecord,
  loadCachedBookBytes,
  loadLegacyBooks,
  saveCachedBookBytes,
} from "./storage";
import { loadTipsForBook, saveTip } from "./tips";

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status}).`);
  }
  return data;
}

function toMeta(json: BookMetaJson): BookMeta {
  return { ...json, addedAt: new Date(json.addedAt) };
}

export async function fetchLibrary(): Promise<BookMeta[]> {
  const res = await fetch("/api/books");
  const data = await readJson<{ books: BookMetaJson[] }>(res);
  return data.books.map(toMeta);
}

export async function uploadBook(file: File): Promise<BookMeta> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/books", { method: "POST", body: form });
  const data = await readJson<{ book: BookMetaJson }>(res);
  return toMeta(data.book);
}

export async function fetchShelf(): Promise<ShelfEntry[]> {
  const res = await fetch("/api/shelf");
  const data = await readJson<{ entries: ShelfEntry[] }>(res);
  return data.entries;
}

export async function updateShelfEntry(
  bookId: string,
  patch: { archived?: boolean; markRead?: boolean },
): Promise<ShelfEntry> {
  const res = await fetch(`/api/shelf/${bookId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await readJson<{ entry: ShelfEntry }>(res);
  return data.entry;
}

export async function removeShelfEntry(bookId: string): Promise<void> {
  const res = await fetch(`/api/shelf/${bookId}`, { method: "DELETE" });
  await readJson<{ ok: boolean }>(res);
}

function decodeBookData(meta: BookMeta, bytes: ArrayBuffer): LibraryBook["data"] {
  if (meta.ext === "txt") return decodeText(bytes);
  if (meta.ext === "pdf") return bytes;
  return new File([bytes], `${meta.title}.epub`, { type: BOOK_MIME.epub });
}

/** Fetch a book's file data (IndexedDB-cached) and hydrate it for the reader. */
export async function loadBookData(meta: BookMeta): Promise<LibraryBook> {
  let bytes = await loadCachedBookBytes(meta.id).catch(() => null);
  if (!bytes) {
    const res = await fetch(`/api/books/${meta.id}/file`);
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Could not download this book.");
    }
    bytes = await res.arrayBuffer();
    // Cache before handing the buffer to the reader — pdf.js may detach it.
    await saveCachedBookBytes(meta.id, bytes).catch(console.error);
  }
  return { ...meta, data: decodeBookData(meta, bytes) };
}

function legacyBookToFile(book: LibraryBook): File {
  if (book.data instanceof File) return book.data;
  const blobPart = book.data; // string (txt) or ArrayBuffer (pdf)
  return new File([blobPart], `${book.title}.${book.ext}`, {
    type: BOOK_MIME[book.ext],
  });
}

/**
 * One-time migration: upload books saved in this browser before the shared
 * library existed, re-link their tips to the new server ids, then drop the
 * local copies. Returns the uploaded books' metadata.
 */
export async function migrateLocalBooks(): Promise<BookMeta[]> {
  const legacy = await loadLegacyBooks();
  const uploaded: BookMeta[] = [];
  for (const book of legacy) {
    try {
      const meta = await uploadBook(legacyBookToFile(book));
      const tips = await loadTipsForBook(book.id);
      // Same tip id, so put() replaces the old record in place.
      for (const tip of tips) {
        await saveTip({ ...tip, bookId: meta.id });
      }
      await deleteBookRecord(book.id);
      uploaded.push(meta);
    } catch (error) {
      console.error(`Failed to migrate "${book.title}" to the library:`, error);
    }
  }
  return uploaded;
}
