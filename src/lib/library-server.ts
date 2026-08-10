import type {
  CollectionReference,
  DocumentSnapshot,
} from "firebase-admin/firestore";

import {
  BOOK_MIME,
  isBookExt,
  type BookExt,
  type BookMetaJson,
  type BookRating,
  type BookStatus,
  type ReadingLocator,
  type ShelfEntry,
} from "./books";
import { getAdminBucket, getAdminFirestore } from "./firebase/admin";
import {
  isReaderMode,
  type ReaderMode,
} from "./readers/reader-mode";

/**
 * Legacy path: book bytes in `books/{id}/chunks/{index}` (Spark-era workaround).
 * New uploads go to Cloud Storage; loadBookFile falls back to chunks when
 * `storagePath` is missing.
 */
const CHUNK_BYTES = 750 * 1024;

/** Firestore doc shape for `books/{id}` (shared library). */
export type BookDoc = {
  title: string;
  ext: string;
  cover: string;
  size: string;
  sizeBytes: number;
  addedAt: string; // ISO 8601
  uploadedBy: string;
  /** Present for Storage-backed books. */
  storagePath?: string;
  /** Present for legacy chunk-backed books. */
  chunkCount?: number;
  /** Sum of all personal ratings (1–5). */
  ratingSum?: number;
  /** Number of users who rated (> 0). */
  ratingCount?: number;
};

/** Firestore doc shape for `users/{uid}/books/{bookId}` (personal state). */
export type UserBookDoc = {
  inMyLibrary?: boolean;
  favorite?: boolean;
  status?: BookStatus | null;
  rating?: number;
  lastReadPage?: number;
  totalPages?: number | null;
  progressPercent?: number;
  locator?: ReadingLocator | null;
  lastOpenedAt?: string | null;
  archived?: boolean;
  lastReadAt?: string | null;
  updatedAt?: string;
};

/** Firestore doc shape for `books/{id}/tips/{tipId}` (pre-authored tip cards). */
export type TipDoc = {
  type: string;
  title: string;
  body: string;
  anchorText: string;
  chapterHref?: string;
  pageNumber?: number;
  references: { label: string; url: string }[];
  order: number;
};

export function booksCollection(): CollectionReference {
  return getAdminFirestore().collection("books");
}

export function tipsCollection(bookId: string): CollectionReference {
  return booksCollection().doc(bookId).collection("tips");
}

/** Personal reading state — preferred path. */
export function userBooksCollection(uid: string): CollectionReference {
  return getAdminFirestore().collection("users").doc(uid).collection("books");
}

/** Legacy thin shelf docs — read fallback / optional dual-write. */
export function legacyShelfCollection(uid: string): CollectionReference {
  return getAdminFirestore().collection("shelves").doc(uid).collection("books");
}

/** @deprecated Prefer userBooksCollection — kept as alias for older imports. */
export function shelfCollection(uid: string): CollectionReference {
  return userBooksCollection(uid);
}

export function bookStoragePath(bookId: string, ext: string): string {
  return `books/${bookId}/original.${ext}`;
}

/** Save file bytes to Cloud Storage. Returns the object path. */
export async function saveBookFile(
  bookId: string,
  bytes: Buffer,
  ext: BookExt,
): Promise<{ storagePath: string }> {
  const storagePath = bookStoragePath(bookId, ext);
  await getAdminBucket().file(storagePath).save(bytes, {
    contentType: BOOK_MIME[ext],
    resumable: false,
    metadata: { cacheControl: "private, max-age=3600" },
  });
  return { storagePath };
}

/** Legacy: write chunk docs (kept for optional migration tooling). */
export async function saveBookFileChunks(
  bookId: string,
  bytes: Buffer,
): Promise<number> {
  const chunks = booksCollection().doc(bookId).collection("chunks");
  const writes: Promise<unknown>[] = [];
  let index = 0;
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    writes.push(
      chunks
        .doc(String(index))
        .set({ index, bytes: bytes.subarray(offset, offset + CHUNK_BYTES) }),
    );
    index += 1;
  }
  await Promise.all(writes);
  return index;
}

async function loadBookFileFromChunks(bookId: string): Promise<Buffer> {
  const snap = await booksCollection()
    .doc(bookId)
    .collection("chunks")
    .orderBy("index")
    .get();
  if (snap.empty) {
    throw new Error("Book file not found.");
  }
  return Buffer.concat(snap.docs.map((doc) => doc.data().bytes as Buffer));
}

/**
 * Load book bytes: Storage when `storagePath` is set, else Firestore chunks.
 */
export async function loadBookFile(
  bookId: string,
  doc?: BookDoc | null,
): Promise<Buffer> {
  const data =
    doc ??
    ((await booksCollection().doc(bookId).get()).data() as BookDoc | undefined);

  if (data?.storagePath) {
    const [buf] = await getAdminBucket().file(data.storagePath).download();
    return buf;
  }

  return loadBookFileFromChunks(bookId);
}

export async function deleteBookStorageObject(
  storagePath: string,
): Promise<void> {
  await getAdminBucket().file(storagePath).delete({ ignoreNotFound: true });
}

export function bookMetaFromDoc(doc: DocumentSnapshot): BookMetaJson | null {
  const data = doc.data() as BookDoc | undefined;
  if (!data || !isBookExt(data.ext)) return null;
  const ratingCount = Math.max(0, Math.floor(data.ratingCount ?? 0));
  const ratingSum = Math.max(0, Number(data.ratingSum ?? 0));
  const averageRating =
    ratingCount > 0 ? Math.round((ratingSum / ratingCount) * 10) / 10 : 0;
  return {
    id: doc.id,
    title: data.title,
    ext: data.ext,
    cover: data.cover,
    size: data.size,
    addedAt: data.addedAt,
    averageRating,
    ratingCount,
  };
}

/**
 * One vote per user for the shared Home average.
 * Source of truth: `books/{bookId}/ratings/{uid}`.
 * Soft-removing from My Books must NOT delete this (rating outlives membership).
 */
export function bookRatingsCollection(bookId: string): CollectionReference {
  return booksCollection().doc(bookId).collection("ratings");
}

function averageFromSumCount(ratingSum: number, ratingCount: number) {
  const count = Math.max(0, Math.floor(ratingCount));
  const sum = Math.max(0, Number(ratingSum));
  return {
    ratingSum: count === 0 ? 0 : sum,
    ratingCount: count,
    averageRating: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
  };
}

/**
 * Set or clear a user's catalog rating (1–5, or 0 to clear).
 * Recomputes `ratingSum` / `ratingCount` from the ratings subcollection so
 * soft-delete / re-add cannot double-count.
 */
export async function setCatalogUserRating(
  bookId: string,
  uid: string,
  next: number,
): Promise<{ averageRating: number; ratingCount: number }> {
  const nextRated = next >= 1 && next <= 5 ? next : 0;
  const bookRef = booksCollection().doc(bookId);
  const ratingRef = bookRatingsCollection(bookId).doc(uid);

  if (nextRated > 0) {
    await ratingRef.set({
      rating: nextRated,
      updatedAt: new Date().toISOString(),
    });
  } else {
    await ratingRef.delete().catch(() => undefined);
  }

  const snap = await bookRatingsCollection(bookId).get();
  let ratingSum = 0;
  let ratingCount = 0;
  for (const doc of snap.docs) {
    const value = Number((doc.data() as { rating?: number }).rating ?? 0);
    if (value >= 1 && value <= 5) {
      ratingSum += value;
      ratingCount += 1;
    }
  }
  const agg = averageFromSumCount(ratingSum, ratingCount);
  await bookRef.set(
    { ratingSum: agg.ratingSum, ratingCount: agg.ratingCount },
    { merge: true },
  );
  return {
    averageRating: agg.averageRating,
    ratingCount: agg.ratingCount,
  };
}

/** @deprecated Prefer setCatalogUserRating — kept for call-site clarity. */
export async function applyCatalogRatingDelta(
  bookId: string,
  _prev: number,
  next: number,
  uid?: string,
): Promise<{ averageRating: number; ratingCount: number }> {
  if (!uid) {
    // Legacy signature without uid — cannot safely update; no-op read.
    const snap = await booksCollection().doc(bookId).get();
    const data = snap.data() as BookDoc | undefined;
    return averageFromSumCount(
      Number(data?.ratingSum ?? 0),
      Number(data?.ratingCount ?? 0),
    );
  }
  return setCatalogUserRating(bookId, uid, next);
}

function asRating(value: unknown): BookRating {
  const n = typeof value === "number" ? value : 0;
  if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) return n;
  return 0;
}

export function shelfEntryFromDoc(doc: DocumentSnapshot): ShelfEntry {
  const data = (doc.data() ?? {}) as UserBookDoc;
  // Explicit false wins — soft-deleted books stay out of My Books but keep rating.
  const inMyLibrary =
    data.inMyLibrary === false || data.archived === true
      ? false
      : data.inMyLibrary === true ||
        data.favorite === true ||
        data.status === "want" ||
        data.status === "finished" ||
        // Legacy shelves docs had no inMyLibrary — treat presence as membership.
        (data.inMyLibrary === undefined &&
          data.favorite === undefined &&
          data.status === undefined &&
          Object.keys(data).length > 0);

  return {
    bookId: doc.id,
    archived: data.archived === true,
    lastReadAt: data.lastReadAt ?? null,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
    inMyLibrary,
    favorite: data.favorite === true,
    status: data.status === "want" || data.status === "finished" ? data.status : null,
    rating: asRating(data.rating),
    lastReadPage: data.lastReadPage ?? 0,
    totalPages: data.totalPages ?? null,
    progressPercent: data.progressPercent ?? 0,
    locator: data.locator ?? null,
    lastOpenedAt: data.lastOpenedAt ?? null,
  };
}

/** Merge preferred user-books with legacy shelves (user-books win). */
export async function listUserBookEntries(uid: string): Promise<ShelfEntry[]> {
  const [modern, legacy] = await Promise.all([
    userBooksCollection(uid).get(),
    legacyShelfCollection(uid).get(),
  ]);
  const byId = new Map<string, ShelfEntry>();
  for (const doc of legacy.docs) {
    byId.set(doc.id, shelfEntryFromDoc(doc));
  }
  for (const doc of modern.docs) {
    byId.set(doc.id, shelfEntryFromDoc(doc));
  }
  return [...byId.values()];
}

/** Per-user reading preferences (`users/{uid}`). */
export type UserPrefs = {
  readerMode: ReaderMode;
};

const DEFAULT_PREFS: UserPrefs = {
  readerMode: "flip",
};

export function userDocRef(uid: string) {
  return getAdminFirestore().collection("users").doc(uid);
}

export async function getUserPrefs(uid: string): Promise<UserPrefs> {
  const snap = await userDocRef(uid).get();
  const data = snap.data() as { readerMode?: unknown } | undefined;
  return {
    readerMode: isReaderMode(data?.readerMode)
      ? data.readerMode
      : DEFAULT_PREFS.readerMode,
  };
}

export async function setUserPrefs(
  uid: string,
  patch: Partial<UserPrefs>,
): Promise<UserPrefs> {
  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (patch.readerMode !== undefined) {
    if (!isReaderMode(patch.readerMode)) {
      throw new Error("Invalid readerMode.");
    }
    update.readerMode = patch.readerMode;
  }
  await userDocRef(uid).set(update, { merge: true });
  return getUserPrefs(uid);
}

export { isReaderMode };
