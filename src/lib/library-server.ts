import type {
  CollectionReference,
  DocumentSnapshot,
} from "firebase-admin/firestore";

import { isBookExt, type BookMetaJson, type ShelfEntry } from "./books";
import { getAdminFirestore } from "./firebase/admin";

/**
 * Book file bytes live in `books/{id}/chunks/{index}` docs because the
 * project is on the Spark plan (no billing), where Cloud Storage buckets
 * cannot be created. Swap saveBookFile/loadBookFile to Storage if billing
 * is ever enabled. Firestore docs max out at 1 MiB, hence the chunking.
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
  chunkCount: number;
};

/** Firestore doc shape for `shelves/{uid}/books/{bookId}`. */
type ShelfDoc = {
  archived?: boolean;
  lastReadAt?: string | null;
  updatedAt?: string;
};

export function booksCollection(): CollectionReference {
  return getAdminFirestore().collection("books");
}

export function shelfCollection(uid: string): CollectionReference {
  return getAdminFirestore().collection("shelves").doc(uid).collection("books");
}

export async function saveBookFile(
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

export async function loadBookFile(bookId: string): Promise<Buffer> {
  const snap = await booksCollection()
    .doc(bookId)
    .collection("chunks")
    .orderBy("index")
    .get();
  return Buffer.concat(
    snap.docs.map((doc) => doc.data().bytes as Buffer),
  );
}

export function bookMetaFromDoc(doc: DocumentSnapshot): BookMetaJson | null {
  const data = doc.data() as BookDoc | undefined;
  if (!data || !isBookExt(data.ext)) return null;
  return {
    id: doc.id,
    title: data.title,
    ext: data.ext,
    cover: data.cover,
    size: data.size,
    addedAt: data.addedAt,
  };
}

export function shelfEntryFromDoc(doc: DocumentSnapshot): ShelfEntry {
  const data = (doc.data() ?? {}) as ShelfDoc;
  return {
    bookId: doc.id,
    archived: data.archived === true,
    lastReadAt: data.lastReadAt ?? null,
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}
