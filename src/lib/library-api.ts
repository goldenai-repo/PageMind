import {
  BOOK_MIME,
  isInMyLibrary,
  normalizeLibraryBook,
  type BookMeta,
  type BookMetaJson,
  type BookRating,
  type BookStatus,
  type LibraryBook,
  type ReadingProgressUpdate,
  type ShelfEntry,
} from "./books";
import { peekCover, rememberCover } from "./cover-cache";
import { extractCoverImage, coverFromTitle } from "./cover";
import { decodeText } from "./readers/decode-text";
import {
  attachCachedCovers,
  deleteBookRecord,
  loadCachedBookBytes,
  loadCachedCover,
  loadLegacyBooks,
  saveCachedBookBytes,
  saveCachedCover,
} from "./storage";
import type { TipCard } from "./tips";
import type { BookSummaryJson } from "./google-books";

export type { BookSummaryJson };

async function readJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Request failed (${res.status}).`);
  }
  return data;
}

function toMeta(json: BookMetaJson): BookMeta {
  return {
    ...json,
    addedAt: new Date(json.addedAt),
    averageRating: json.averageRating ?? 0,
    ratingCount: json.ratingCount ?? 0,
  };
}

export async function fetchLibrary(): Promise<BookMeta[]> {
  const res = await fetch("/api/books");
  const data = await readJson<{ books: BookMetaJson[] }>(res);
  return data.books.map(toMeta);
}

export async function fetchTipsForBook(bookId: string): Promise<TipCard[]> {
  const res = await fetch(`/api/tips/${bookId}`);
  const data = await readJson<{ tips: TipCard[] }>(res);
  return data.tips;
}

export async function fetchBookSummary(bookId: string): Promise<BookSummaryJson> {
  const res = await fetch(`/api/books/${bookId}/summary`);
  return readJson<BookSummaryJson>(res);
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

export type UserBookPatch = {
  archived?: boolean;
  markRead?: boolean;
  inMyLibrary?: boolean;
  favorite?: boolean;
  status?: BookStatus | null;
  rating?: BookRating;
  reviewTitle?: string;
  reviewBody?: string;
  progress?: ReadingProgressUpdate;
  lastOpenedAt?: string | null;
};

export async function updateShelfEntry(
  bookId: string,
  patch: UserBookPatch,
): Promise<
  ShelfEntry & { averageRating?: number; ratingCount?: number }
> {
  const res = await fetch(`/api/shelf/${bookId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await readJson<{
    entry: ShelfEntry;
    averageRating?: number;
    ratingCount?: number;
  }>(res);
  return {
    ...data.entry,
    averageRating: data.averageRating,
    ratingCount: data.ratingCount,
  };
}

/** Soft-remove from My Library (catalog book stays on Home; rating kept). */
export async function removeShelfEntry(bookId: string): Promise<ShelfEntry> {
  const res = await fetch(`/api/shelf/${bookId}`, { method: "DELETE" });
  const data = await readJson<{ ok: boolean; entry: ShelfEntry }>(res);
  return data.entry;
}

function decodeBookData(meta: BookMeta, bytes: ArrayBuffer): LibraryBook["data"] {
  if (meta.ext === "txt") return decodeText(bytes);
  if (meta.ext === "pdf") return bytes;
  return new File([bytes], `${meta.title}.epub`, { type: BOOK_MIME.epub });
}

/** Apply personal shelf fields onto catalog metadata (no file bytes yet). */
export function mergeMetaWithShelf(
  meta: BookMeta,
  entry?: ShelfEntry | null,
): LibraryBook {
  return normalizeLibraryBook({
    ...meta,
    data: new ArrayBuffer(0),
    averageRating: meta.averageRating ?? 0,
    ratingCount: meta.ratingCount ?? 0,
    inMyLibrary: entry?.inMyLibrary,
    favorite: entry?.favorite,
    status: entry?.status ?? undefined,
    rating: entry?.rating,
    reviewTitle: entry?.reviewTitle,
    reviewBody: entry?.reviewBody,
    lastReadPage: entry?.lastReadPage,
    totalPages: entry?.totalPages,
    progressPercent: entry?.progressPercent,
    locator: entry?.locator,
    lastOpenedAt: entry?.lastOpenedAt ? new Date(entry.lastOpenedAt) : null,
  });
}

/** Catalog + personal state for the library UI (covers from local cache when present). */
export async function fetchLibraryBooks(): Promise<LibraryBook[]> {
  const [metas, entries] = await Promise.all([fetchLibrary(), fetchShelf()]);
  const byId = new Map(entries.map((e) => [e.bookId, e]));
  const merged = metas
    .map((meta) => mergeMetaWithShelf(meta, byId.get(meta.id)))
    .sort((a, b) => a.addedAt.getTime() - b.addedAt.getTime());
  return attachCachedCovers(merged);
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

/**
 * EPUB embedded cover / PDF page 1 / title gradient.
 * Pass the local File when uploading so we don't need a round-trip.
 */
export async function coverImageForBook(
  book: Pick<LibraryBook, "title" | "ext" | "data">,
  file?: File | ArrayBuffer | string | null,
): Promise<Blob | null> {
  const source =
    file ??
    (book.data instanceof File || book.data instanceof ArrayBuffer
      ? book.data
      : null);
  return extractCoverImage(source, book.ext, { title: book.title });
}

/**
 * Resolve one book's cover (memory → IndexedDB → extract / title art).
 * Used by the overlay so the open book isn't stuck behind the sequential queue.
 */
export async function ensureCover(
  book: Pick<LibraryBook, "id" | "title" | "ext" | "data" | "coverImage">,
): Promise<Blob | null> {
  if (book.coverImage) {
    rememberCover(book.id, book.coverImage);
    return book.coverImage;
  }
  const memory = peekCover(book.id);
  if (memory) return memory;
  const cached = await loadCachedCover(book.id).catch(() => null);
  if (cached) {
    rememberCover(book.id, cached);
    return cached;
  }

  try {
    let coverImage: Blob | null = null;
    if (book.ext === "txt") {
      coverImage = await coverFromTitle(book.title, book.ext);
    } else if (book.ext === "epub" || book.ext === "pdf") {
      const withData = await loadBookData(book);
      coverImage = await coverImageForBook(withData);
    }
    if (!coverImage) return null;
    rememberCover(book.id, coverImage);
    void saveCachedCover(book.id, coverImage).catch(console.error);
    return coverImage;
  } catch (err) {
    console.error(`Cover extract failed for ${book.title}:`, err);
    const fallback = await coverFromTitle(book.title, book.ext).catch(
      () => null,
    );
    if (fallback) {
      rememberCover(book.id, fallback);
      void saveCachedCover(book.id, fallback).catch(console.error);
    }
    return fallback;
  }
}

/**
 * Fill missing covers after the list paints.
 * EPUB/PDF: real cover (or title fallback). TXT: title art.
 * Results are cached so refresh shows the final cover immediately.
 */
export async function enrichEpubPdfCovers(
  books: LibraryBook[],
  onCover: (bookId: string, coverImage: Blob) => void,
  signal?: { cancelled: boolean },
  priorityId?: string | null,
): Promise<void> {
  const ordered = priorityId
    ? [...books].sort(
        (a, b) => Number(b.id === priorityId) - Number(a.id === priorityId),
      )
    : books;

  for (const book of ordered) {
    if (signal?.cancelled) return;
    if (book.coverImage) {
      rememberCover(book.id, book.coverImage);
      continue;
    }
    const cover = await ensureCover(book);
    if (!cover || signal?.cancelled) continue;
    onCover(book.id, cover);
  }
}

/** Open a catalog book: download bytes + ensure My Library membership. */
export async function openLibraryBook(book: LibraryBook): Promise<LibraryBook> {
  const [withData, entry] = await Promise.all([
    loadBookData(book),
    book.inMyLibrary
      ? updateShelfEntry(book.id, {
          markRead: true,
          lastOpenedAt: new Date().toISOString(),
        }).catch(() => null)
      : updateShelfEntry(book.id, {
          inMyLibrary: true,
          markRead: true,
          lastOpenedAt: new Date().toISOString(),
        }),
  ]);

  const coverImage =
    book.coverImage ??
    (await coverImageForBook(withData).catch(() => null)) ??
    null;
  if (coverImage) {
    void saveCachedCover(book.id, coverImage).catch(console.error);
  }

  const merged = entry
    ? mergeMetaWithShelf(withData, entry)
    : { ...withData, inMyLibrary: true };
  return {
    ...merged,
    data: withData.data,
    coverImage: coverImage ?? undefined,
  };
}

export function applyShelfEntry(
  book: LibraryBook,
  entry: ShelfEntry,
): LibraryBook {
  return {
    ...book,
    inMyLibrary: entry.inMyLibrary ?? isInMyLibrary(book),
    favorite: entry.favorite,
    status: entry.status ?? undefined,
    // Always take server personal rating (including 0 = cleared by user).
    rating: (entry.rating ?? 0) as BookRating,
    reviewTitle: entry.reviewTitle ?? book.reviewTitle ?? "",
    reviewBody: entry.reviewBody ?? book.reviewBody ?? "",
    lastReadPage: entry.lastReadPage ?? book.lastReadPage,
    totalPages: entry.totalPages ?? book.totalPages,
    progressPercent: entry.progressPercent ?? book.progressPercent,
    locator: entry.locator ?? book.locator,
    lastOpenedAt: entry.lastOpenedAt
      ? new Date(entry.lastOpenedAt)
      : book.lastOpenedAt,
  };
}

function legacyBookToFile(book: LibraryBook): File {
  if (book.data instanceof File) return book.data;
  const blobPart = book.data;
  return new File([blobPart], `${book.title}.${book.ext}`, {
    type: BOOK_MIME[book.ext],
  });
}

/**
 * One-time migration: upload books saved in this browser before the shared
 * library existed, then drop the local copies.
 */
export async function migrateLocalBooks(): Promise<BookMeta[]> {
  const legacy = await loadLegacyBooks();
  const uploaded: BookMeta[] = [];
  for (const book of legacy) {
    try {
      const meta = await uploadBook(legacyBookToFile(book));
      await deleteBookRecord(book.id);
      uploaded.push(meta);
    } catch (error) {
      console.error(`Failed to migrate "${book.title}" to the library:`, error);
    }
  }
  return uploaded;
}

export type UserPrefsJson = {
  readerMode: "flip" | "scroll" | "spread";
};

export async function fetchUserPrefs(): Promise<UserPrefsJson> {
  const res = await fetch("/api/user/prefs");
  const data = await readJson<{ prefs: UserPrefsJson }>(res);
  return data.prefs;
}

export async function saveUserPrefs(
  patch: Partial<UserPrefsJson>,
): Promise<UserPrefsJson> {
  const res = await fetch("/api/user/prefs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const data = await readJson<{ prefs: UserPrefsJson }>(res);
  return data.prefs;
}
