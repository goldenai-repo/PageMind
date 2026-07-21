export const COVERS = [
  "linear-gradient(145deg, #1B365D 0%, #2a4f87 100%)",
  "linear-gradient(145deg, #2E86AB 0%, #1a6a8a 100%)",
  "linear-gradient(145deg, #27a96c 0%, #187a4f 100%)",
  "linear-gradient(145deg, #7c3aed 0%, #5b21b6 100%)",
  "linear-gradient(145deg, #d97706 0%, #92400e 100%)",
  "linear-gradient(145deg, #dc2626 0%, #991b1b 100%)",
  "linear-gradient(145deg, #0f766e 0%, #0d5c56 100%)",
  "linear-gradient(145deg, #be185d 0%, #9d174d 100%)",
] as const;

export type BookExt = "pdf" | "epub" | "txt";

export type LibraryBook = {
  id: string;
  title: string;
  ext: BookExt;
  cover: string;
  size: string;
  addedAt: Date;
  /** Firebase Storage download URL for the file. */
  fileUrl: string;
  /**
   * File for EPUB; ArrayBuffer for PDF; string for TXT. Undefined until the
   * reader is opened — fetched on demand via downloadBookData() so listing
   * the library doesn't require downloading every file's bytes upfront.
   */
  data?: File | ArrayBuffer | string;
};

/** Deterministic cover gradient per book id, stable across refetches/reorders. */
export function coverForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return COVERS[Math.abs(hash) % COVERS.length];
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
