"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, MoreHorizontal } from "lucide-react";

import { BookReader } from "@/components/book-reader";
import { StarRating } from "@/components/star-rating";
import {
  isInMyLibrary,
  removeFromMyLibrary,
  type BookRating,
  type BookStatus,
  type LibraryBook,
  type LibraryShelf,
  type ReadingProgressUpdate,
} from "@/lib/books";
import { loadBooks, saveBook } from "@/lib/storage";

function bookStatus(book: LibraryBook): BookStatus | undefined {
  return book.status;
}

function matchesShelf(book: LibraryBook, shelf: LibraryShelf) {
  switch (shelf) {
    case "store":
      return true;
    case "mine":
      return isInMyLibrary(book);
    case "favorite":
      return Boolean(book.favorite);
    case "want":
      return bookStatus(book) === "want";
    case "finished":
      return bookStatus(book) === "finished";
  }
}

export function LibrarySection({
  userId,
  shelf = "store",
}: {
  userId: string;
  shelf?: LibraryShelf;
}) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [currentBookId, setCurrentBookId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBooks(userId)
      .then((loaded) => {
        if (!cancelled) setBooks(loaded);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!menuOpenId) return;
    const close = () => setMenuOpenId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpenId]);

  const visibleBooks = useMemo(() => {
    return books
      .filter((b) => matchesShelf(b, shelf))
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
  }, [books, shelf]);

  const currentBook = useMemo(
    () => books.find((b) => b.id === currentBookId) ?? null,
    [books, currentBookId],
  );

  const updateBook = (book: LibraryBook, patch: Partial<LibraryBook>) => {
    const updated: LibraryBook = { ...book, ...patch };
    if ("status" in patch && patch.status === undefined) {
      delete updated.status;
    }
    setBooks((prev) => prev.map((b) => (b.id === book.id ? updated : b)));
    void saveBook(userId, updated);
    setMenuOpenId(null);
    return updated;
  };

  const openBook = (book: LibraryBook) => {
    updateBook(book, {
      inMyLibrary: true,
      lastOpenedAt: book.lastOpenedAt ?? new Date(),
    });
    setCurrentBookId(book.id);
  };

  const onProgress = useCallback(
    (progress: ReadingProgressUpdate) => {
      setBooks((prev) => {
        const current = prev.find((b) => b.id === currentBookId);
        if (!current) return prev;
        const updated: LibraryBook = {
          ...current,
          inMyLibrary: true,
          lastReadPage: progress.lastReadPage,
          totalPages: progress.totalPages,
          progressPercent: progress.progressPercent,
          locator: progress.locator,
          lastOpenedAt: new Date(),
          ...(progress.progressPercent >= 100
            ? { status: "finished" as const }
            : {}),
        };
        void saveBook(userId, updated);
        return prev.map((b) => (b.id === current.id ? updated : b));
      });
    },
    [currentBookId, userId],
  );

  const setRating = (book: LibraryBook, rating: BookRating) => {
    updateBook(book, { rating });
  };

  if (visibleBooks.length === 0) {
    const emptyLabel =
      shelf === "store" ? "No books yet" : "No books on this shelf";
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-navy/40">
          <BookOpen className="size-8" />
        </div>
        <p className="text-[1.1rem] font-semibold text-foreground">
          {emptyLabel}
        </p>
      </div>
    );
  }

  const isStore = shelf === "store";

  return (
    <>
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-x-6 gap-y-8"
        role="list"
        aria-label="Book collection"
      >
        {visibleBooks.map((book) => {
          const saved = isInMyLibrary(book);
          const percent = book.progressPercent ?? 0;
          const showProgress = Boolean(book.lastOpenedAt) || percent > 0;
          const rating = (book.rating ?? 0) as BookRating;

          return (
            <div
              key={book.id}
              className="relative flex flex-col"
              role="listitem"
            >
              <button
                type="button"
                onClick={() => openBook(book)}
                className="group relative flex h-[210px] w-full items-center justify-center overflow-hidden rounded-xl shadow-[0_2px_10px_rgba(27,54,93,0.07)] outline-none transition-all hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(27,54,93,0.15)] focus-visible:ring-3 focus-visible:ring-navy/25"
                style={{ background: book.cover }}
                aria-label={`${book.title} — ${book.ext.toUpperCase()}`}
              >
                <div className="absolute inset-y-0 left-0 w-[13px] border-r border-white/10 bg-black/20" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_55%)]" />
                <BookOpen className="size-10 text-white opacity-40" />
                {book.favorite ? (
                  <span className="absolute top-2.5 left-3 rounded bg-black/30 px-1.5 py-0.5 text-[0.63rem] font-bold tracking-wider text-white/90 backdrop-blur-sm">
                    ★
                  </span>
                ) : null}
                <span className="absolute right-2.5 bottom-2.5 rounded bg-black/30 px-1.5 py-0.5 text-[0.63rem] font-bold tracking-wider text-white/90 backdrop-blur-sm">
                  {book.ext.toUpperCase()}
                </span>
              </button>

              <p
                className="mt-2 line-clamp-2 px-0.5 text-[0.875rem] leading-snug font-semibold text-foreground"
                title={book.title}
              >
                {book.title}
              </p>

              <div className="mt-1.5 flex items-center gap-2 px-0.5">
                {showProgress ? (
                  <>
                    <span className="w-8 shrink-0 text-[0.7rem] tabular-nums text-muted-foreground">
                      {percent}%
                    </span>
                    <div
                      className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={percent}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${book.title} reading progress`}
                    >
                      <div
                        className="h-full rounded-full bg-navy transition-[width]"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <div className="min-w-0 flex-1" aria-hidden />
                )}

                <div className="relative shrink-0">
                  <button
                    type="button"
                    aria-label={`Options for ${book.title}`}
                    aria-expanded={menuOpenId === book.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId((id) => (id === book.id ? null : book.id));
                    }}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-navy"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                  {menuOpenId === book.id ? (
                    <div
                      className="absolute top-full right-0 z-20 mt-1 min-w-48 overflow-hidden rounded-[6px] border border-border bg-white py-1 shadow-[0_8px_24px_rgba(27,54,93,0.12)]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isStore ? (
                        <>
                          {!saved ? (
                            <button
                              type="button"
                              className="block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium text-foreground hover:bg-muted"
                              onClick={() =>
                                updateBook(book, { inMyLibrary: true })
                              }
                            >
                              Add to My Books
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium text-foreground hover:bg-muted"
                            onClick={() =>
                              updateBook(book, {
                                favorite: !book.favorite,
                                ...(book.favorite
                                  ? {}
                                  : { inMyLibrary: true }),
                              })
                            }
                          >
                            {book.favorite
                              ? "Remove Favorite"
                              : "Add to Favorite"}
                          </button>
                          <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium text-foreground hover:bg-muted"
                            onClick={() =>
                              updateBook(book, {
                                status: "want",
                                inMyLibrary: true,
                              })
                            }
                          >
                            Add to Want to Read
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium text-foreground hover:bg-muted"
                            onClick={() =>
                              updateBook(book, {
                                favorite: !book.favorite,
                                ...(book.favorite
                                  ? {}
                                  : { inMyLibrary: true }),
                              })
                            }
                          >
                            {book.favorite
                              ? "Remove Favorite"
                              : "Add to Favorite"}
                          </button>
                          <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium text-foreground hover:bg-muted"
                            onClick={() =>
                              updateBook(book, {
                                status: "want",
                                inMyLibrary: true,
                              })
                            }
                          >
                            Want to Read
                          </button>
                          <button
                            type="button"
                            className="block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium text-red-600 hover:bg-muted"
                            onClick={() =>
                              updateBook(book, removeFromMyLibrary(book))
                            }
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-1.5 px-0.5">
                {isStore ? (
                  <StarRating value={rating} label="Average rating" />
                ) : (
                  <StarRating
                    value={rating}
                    onChange={(next) => setRating(book, next)}
                    label="Your rating"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {currentBook ? (
        <BookReader
          book={currentBook}
          onClose={() => setCurrentBookId(null)}
          onProgress={onProgress}
        />
      ) : null}
    </>
  );
}
