import type { SupabaseClient } from "@supabase/supabase-js";

import {
  coverForId,
  extFromUrl,
  formatSize,
  type BookExt,
  type LibraryBook,
} from "@/lib/books";

const BUCKET = "books";

const CONTENT_TYPES: Record<BookExt, string> = {
  txt: "text/plain",
  pdf: "application/pdf",
  epub: "application/epub+zip",
};

type BookRow = {
  id: number;
  title: string;
  file_url: string;
  file_size: number;
  created_at: string;
};

const BOOK_COLUMNS = "id, title, file_url, file_size, created_at";

function rowToBook(row: BookRow): LibraryBook | null {
  const ext = extFromUrl(row.file_url);
  if (!ext) return null;
  const id = String(row.id);
  return {
    id,
    title: row.title,
    ext,
    fileUrl: row.file_url,
    size: formatSize(row.file_size),
    addedAt: new Date(row.created_at),
    cover: coverForId(id),
  };
}

/** Fetches the signed-in user's book metadata, oldest first. Storage bytes are not fetched here. */
export async function listBooks(
  supabase: SupabaseClient,
  userId: string,
): Promise<LibraryBook[]> {
  const { data, error } = await supabase
    .from("books")
    .select(BOOK_COLUMNS)
    .eq("user_id", userId)
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as BookRow[])
    .map(rowToBook)
    .filter((book): book is LibraryBook => book !== null);
}

/** Uploads the raw file to the caller's folder in Storage, then records its metadata in the DB. */
export async function uploadBook(
  supabase: SupabaseClient,
  userId: string,
  file: File,
  ext: BookExt,
  title: string,
): Promise<LibraryBook> {
  const storagePath = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType: CONTENT_TYPES[ext] });
  if (uploadError) throw new Error(uploadError.message);

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath);

  const { data, error: insertError } = await supabase
    .from("books")
    .insert({
      title,
      file_url: publicUrlData.publicUrl,
      file_size: file.size,
      user_id: userId,
    })
    .select(BOOK_COLUMNS)
    .single();

  if (insertError) {
    // Don't leave an orphaned file behind if the metadata row failed.
    await supabase.storage.from(BUCKET).remove([storagePath]);
    throw new Error(insertError.message);
  }

  const book = rowToBook(data as BookRow);
  if (!book) {
    throw new Error("Uploaded file has an unrecognized extension.");
  }
  return book;
}

/** Bucket-relative path encoded in a Storage public URL, e.g. ".../object/public/books/x.epub" -> "x.epub". */
function pathFromPublicUrl(url: string): string {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) throw new Error("Unrecognized file URL format.");
  return decodeURIComponent(url.slice(idx + marker.length));
}

/**
 * Downloads a book's raw bytes through the authenticated Storage API (not a
 * plain `fetch` of the public URL — that depends on the bucket's "public"
 * flag actually being set, which isn't reliable, and requires no apikey).
 * This only needs a SELECT policy on storage.objects for the 'books' bucket.
 */
export async function downloadBookData(
  supabase: SupabaseClient,
  book: LibraryBook,
): Promise<File | ArrayBuffer | string> {
  const path = pathFromPublicUrl(book.fileUrl);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(error.message);

  if (book.ext === "txt") return data.text();
  if (book.ext === "pdf") return data.arrayBuffer();
  return new File([data], `${book.title}.epub`, { type: CONTENT_TYPES.epub });
}
