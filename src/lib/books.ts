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

/** Reading shelf inside My Library */
export type BookStatus = "want" | "finished";

/**
 * Sidebar filters:
 * - store: Book Store → All Books (every uploaded book)
 * - mine / favorite / want / finished: My Library shelves
 */
export type LibraryShelf = "store" | "mine" | "favorite" | BookStatus;

export type LibraryBook = {
  id: string;
  title: string;
  ext: BookExt;
  cover: string;
  size: string;
  addedAt: Date;
  /** File for EPUB; ArrayBuffer for PDF; string for TXT */
  data: File | ArrayBuffer | string;
  /** In the user's personal library (My Books) */
  inMyLibrary?: boolean;
  /** Reading status within My Library */
  status?: BookStatus;
  favorite?: boolean;
};

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
