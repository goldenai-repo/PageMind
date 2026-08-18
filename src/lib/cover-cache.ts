/** In-memory cover blobs so shelf cards and the detail overlay share one image. */
const covers = new Map<string, Blob>();

export function rememberCover(bookId: string, blob: Blob) {
  covers.set(bookId, blob);
}

export function peekCover(bookId: string): Blob | null {
  return covers.get(bookId) ?? null;
}
