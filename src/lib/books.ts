import type { ReaderMode } from "@/lib/readers/reader-mode";

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
 * - home: shared catalog feed (every uploaded book; later Firestore-shared)
 * - mine / favorite / want / finished: My Library shelves (per-user)
 */
export type LibraryShelf = "home" | "mine" | "favorite" | BookStatus;

export type BookRating = 0 | 1 | 2 | 3 | 4 | 5;

export type ReadingLocator =
  | { format: "pdf"; page: number }
  | {
      format: "txt";
      sectionIdx: number;
      page: number;
      mode: ReaderMode;
    }
  | {
      format: "epub";
      sectionIdx: number;
      page: number;
      mode: ReaderMode;
      href?: string;
    };

export type LibraryBook = {
  id: string;
  title: string;
  ext: BookExt;
  /** CSS gradient fallback when no cover image */
  cover: string;
  /** Extracted cover thumbnail (EPUB/PDF); shown on shelf cards */
  coverImage?: Blob | null;
  size: string;
  addedAt: Date;
  /** File for EPUB; ArrayBuffer for PDF; string for TXT */
  data: File | ArrayBuffer | string;
  /** In the user's personal library (My Books) */
  inMyLibrary?: boolean;
  /** Reading status within My Library */
  status?: BookStatus;
  favorite?: boolean;
  /** Personal rating; 0 = unrated */
  rating?: BookRating;
  /** 1-based last page (PDF) or page-in-section (reflowable) */
  lastReadPage?: number;
  totalPages?: number | null;
  /** 0–100; denormalized for the shelf grid */
  progressPercent?: number;
  locator?: ReadingLocator | null;
  lastOpenedAt?: Date | null;
};

export type ReadingProgressUpdate = {
  lastReadPage: number;
  totalPages: number;
  progressPercent: number;
  locator: ReadingLocator;
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

/** Clamp progress to an integer 0–100. */
export function computeProgressPercent(
  lastReadPage: number,
  totalPages: number,
): number {
  if (!Number.isFinite(lastReadPage) || !Number.isFinite(totalPages)) return 0;
  if (totalPages <= 0) return 0;
  const raw = (lastReadPage / totalPages) * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Section-weighted progress for reflowable books (TXT/EPUB), where global
 * page count isn't known up front.
 */
export function computeSectionProgressPercent(
  sectionIdx: number,
  sectionCount: number,
  page: number,
  pageCount: number,
): number {
  if (sectionCount <= 0) return 0;
  const pages = Math.max(1, pageCount);
  const within = Math.min(1, Math.max(0, (page + 1) / pages));
  const raw = ((sectionIdx + within) / sectionCount) * 100;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

export function isInMyLibrary(book: LibraryBook): boolean {
  return Boolean(
    book.inMyLibrary ||
      book.favorite ||
      book.status === "want" ||
      book.status === "finished",
  );
}

/** Defaults for older IndexedDB rows missing Phase 1 fields. */
export function normalizeLibraryBook(
  book: LibraryBook,
): LibraryBook {
  return {
    ...book,
    rating: (book.rating ?? 0) as BookRating,
    lastReadPage: book.lastReadPage ?? 0,
    totalPages: book.totalPages ?? null,
    progressPercent: book.progressPercent ?? 0,
    locator: book.locator ?? null,
    lastOpenedAt: book.lastOpenedAt ?? null,
  };
}

/** Remove from My Books only — catalog row stays on Home. */
export function removeFromMyLibrary(book: LibraryBook): LibraryBook {
  return {
    ...book,
    inMyLibrary: false,
    favorite: false,
    status: undefined,
  };
}
