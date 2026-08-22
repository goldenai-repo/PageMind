import type { LibraryShelf } from "@/lib/books";

const SHELVES: LibraryShelf[] = ["home", "mine", "favorite", "want", "finished"];

export function parseLibraryShelf(value: string | null | undefined): LibraryShelf {
  if (value && (SHELVES as string[]).includes(value) && value !== "home") {
    return value as LibraryShelf;
  }
  // Accept legacy ?shelf=store links as Home.
  return "home";
}

/**
 * Home catalog: `/library` or `/library/{bookId}`.
 * Personal shelves keep `?shelf=` on the index only — detail URLs are Home.
 */
export function libraryPath(
  bookId?: string | null,
  shelf?: LibraryShelf | null,
): string {
  if (bookId) return `/library/${encodeURIComponent(bookId)}`;
  if (!shelf || shelf === "home") return "/library";
  return `/library?shelf=${shelf}`;
}

export function bookReviewsPath(bookId: string): string {
  return `/library/${encodeURIComponent(bookId)}/reviews`;
}

/** Book id from `/library/{bookId}`; `null` on the shelf index. */
export function bookIdFromLibraryPath(pathname: string): string | null {
  const match = pathname.match(/^\/library\/([^/]+)$/);
  if (!match?.[1]) return null;
  return decodePathSegment(match[1]);
}

/** Book id from `/library/{bookId}/reviews`. */
export function bookIdFromReviewsPath(pathname: string): string | null {
  const match = pathname.match(/^\/library\/([^/]+)\/reviews$/);
  if (!match?.[1]) return null;
  return decodePathSegment(match[1]);
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
