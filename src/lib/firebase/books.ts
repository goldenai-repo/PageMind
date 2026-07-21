import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { coverForId, formatSize, type BookExt, type LibraryBook } from "@/lib/books";
import { getFirebaseFirestore, getFirebaseStorage } from "./client";

const COLLECTION = "books";
const STORAGE_FOLDER = "books";

const CONTENT_TYPES: Record<BookExt, string> = {
  txt: "text/plain",
  pdf: "application/pdf",
  epub: "application/epub+zip",
};

type BookDoc = {
  title: string;
  ext: BookExt;
  fileUrl: string;
  fileSize: number;
  userId: string;
  createdAt: Timestamp;
};

function docToBook(id: string, data: BookDoc): LibraryBook {
  return {
    id,
    title: data.title,
    ext: data.ext,
    fileUrl: data.fileUrl,
    size: formatSize(data.fileSize),
    addedAt: data.createdAt.toDate(),
    cover: coverForId(id),
  };
}

/** Fetches the signed-in user's book metadata, oldest first. Storage bytes are not fetched here. */
export async function listBooks(userId: string): Promise<LibraryBook[]> {
  const q = query(
    collection(getFirebaseFirestore(), COLLECTION),
    where("userId", "==", userId),
    orderBy("createdAt", "asc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => docToBook(d.id, d.data() as BookDoc));
}

/** Uploads the raw file to the caller's folder in Storage, then records its metadata in Firestore. */
export async function uploadBook(
  userId: string,
  file: File,
  ext: BookExt,
  title: string,
): Promise<LibraryBook> {
  const id = crypto.randomUUID();
  const storagePath = `${STORAGE_FOLDER}/${userId}/${id}.${ext}`;

  const fileRef = ref(getFirebaseStorage(), storagePath);
  await uploadBytes(fileRef, file, { contentType: CONTENT_TYPES[ext] });
  const fileUrl = await getDownloadURL(fileRef);

  await setDoc(doc(getFirebaseFirestore(), COLLECTION, id), {
    title,
    ext,
    fileUrl,
    fileSize: file.size,
    userId,
    createdAt: serverTimestamp(),
  });

  return {
    id,
    title,
    ext,
    fileUrl,
    size: formatSize(file.size),
    addedAt: new Date(),
    cover: coverForId(id),
  };
}

/** Downloads a book's raw bytes from its Storage download URL, shaped for the reader by file type. */
export async function downloadBookData(
  book: LibraryBook,
): Promise<File | ArrayBuffer | string> {
  const res = await fetch(book.fileUrl);
  if (!res.ok) {
    throw new Error(`Could not download file (HTTP ${res.status}).`);
  }

  if (book.ext === "txt") return res.text();
  if (book.ext === "pdf") return res.arrayBuffer();
  const blob = await res.blob();
  return new File([blob], `${book.title}.epub`, { type: CONTENT_TYPES.epub });
}
