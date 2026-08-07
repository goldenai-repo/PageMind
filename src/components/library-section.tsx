"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen } from "lucide-react";

import { BookCard, type BookCardMenuItem } from "@/components/book-card";
import { BookReader } from "@/components/book-reader";
import {
  isInMyLibrary,
  removeFromMyLibrary,
  type BookRating,
  type BookStatus,
  type LibraryBook,
  type LibraryShelf,
  type ReadingProgressUpdate,
} from "@/lib/books";
import { extractCoverImage } from "@/lib/cover";
import { loadBooks, saveBook } from "@/lib/storage";

function bookStatus(book: LibraryBook): BookStatus | undefined {
  return book.status;
}

/** Fill coverImage for older books that only have a gradient. */
async function backfillCovers(
  userId: string,
  books: LibraryBook[],
  setBooks: React.Dispatch<React.SetStateAction<LibraryBook[]>>,
) {
  for (const book of books) {
    if (book.coverImage) continue;
    const coverImage = await extractCoverImage(book.data, book.ext, {
      title: book.title,
    });
    if (!coverImage) continue;
    const updated = { ...book, coverImage };
    setBooks((prev) => prev.map((b) => (b.id === book.id ? updated : b)));
    void saveBook(userId, updated);
  }
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
        if (cancelled) return;
        setBooks(loaded);
        void backfillCovers(userId, loaded, setBooks);
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

  const isStore = shelf === "store";

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

  return (
    <>
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]"
        role="list"
        aria-label="Book collection"
      >
        {visibleBooks.map((book) => {
          const saved = isInMyLibrary(book);

          const menuItems: BookCardMenuItem[] = isStore
            ? [
                ...(!saved
                  ? [
                      {
                        label: "Add to My Books",
                        onSelect: () =>
                          updateBook(book, { inMyLibrary: true }),
                      },
                    ]
                  : []),
                {
                  label: book.favorite
                    ? "Remove Favorite"
                    : "Add to Favorite",
                  onSelect: () =>
                    updateBook(book, {
                      favorite: !book.favorite,
                      ...(book.favorite ? {} : { inMyLibrary: true }),
                    }),
                },
                {
                  label: "Add to Want to Read",
                  onSelect: () =>
                    updateBook(book, {
                      status: "want",
                      inMyLibrary: true,
                    }),
                },
              ]
            : [
                {
                  label: book.favorite
                    ? "Remove Favorite"
                    : "Add to Favorite",
                  onSelect: () =>
                    updateBook(book, {
                      favorite: !book.favorite,
                      ...(book.favorite ? {} : { inMyLibrary: true }),
                    }),
                },
                {
                  label: "Want to Read",
                  onSelect: () =>
                    updateBook(book, {
                      status: "want",
                      inMyLibrary: true,
                    }),
                },
                {
                  label: "Delete",
                  danger: true,
                  onSelect: () =>
                    updateBook(book, removeFromMyLibrary(book)),
                },
              ];

          return (
            <BookCard
              key={book.id}
              book={book}
              onOpen={() => openBook(book)}
              showProgress
              showRating
              // Same StarRating look on all shelves; only My Library shelves rate.
              onRate={
                isStore
                  ? undefined
                  : (rating: BookRating) => updateBook(book, { rating })
              }
              menuOpen={menuOpenId === book.id}
              onMenuOpenChange={(open) =>
                setMenuOpenId(open ? book.id : null)
              }
              menuItems={menuItems}
            />
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
