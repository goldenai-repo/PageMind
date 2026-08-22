import type { LibraryShelf } from "@/lib/books";

const SHELVES: LibraryShelf[] = ["home", "mine", "favorite", "want", "finished"];

export function parseLibraryShelf(value: string | null | undefined): LibraryShelf {
  if (value && (SHELVES as string[]).includes(value) && value !== "home") {
    return value as LibraryShelf;
  }
  // Accept legacy ?shelf=store links as Home.
  return "home";
}

function shelfQuery(shelf?: LibraryShelf | null): string {
  if (!shelf || shelf === "home") return "";
  return `?shelf=${shelf}`;
}

/**
 * Shelf index: `/library` or `/library?shelf=mine`.
 * Book overlay/reader: `/library/{bookId}` (Home) or
 * `/library/{bookId}?shelf=mine` so the shelf under the overlay is preserved.
 */
export function libraryPath(
  bookId?: string | null,
  shelf?: LibraryShelf | null,
): string {
  const query = shelfQuery(shelf);
  if (bookId) return `/library/${encodeURIComponent(bookId)}${query}`;
  return query ? `/library${query}` : "/library";
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
