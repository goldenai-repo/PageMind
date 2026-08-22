"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";

import { BookCard, type BookCardMenuItem } from "@/components/book-card";
import { BookDetailOverlay } from "@/components/book-detail-overlay";
import { BookReader } from "@/components/book-reader";
import { RateReviewDialog } from "@/components/rate-review-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  isInMyLibrary,
  removeFromMyLibrary,
  type BookStatus,
  type LibraryBook,
  type LibraryShelf,
  type ReadingProgressUpdate,
} from "@/lib/books";
import {
  applyShelfEntry,
  enrichCatalogTitles,
  enrichEpubPdfCovers,
  ensureCover,
  fetchLibraryBooks,
  migrateLocalBooks,
  openLibraryBook,
  removeShelfEntry,
  updateShelfEntry,
} from "@/lib/library-api";
import { bookIdFromLibraryPath, libraryPath } from "@/lib/library-path";

function bookStatus(book: LibraryBook): BookStatus | undefined {
  return book.status;
}

function matchesShelf(book: LibraryBook, shelf: LibraryShelf) {
  switch (shelf) {
    case "home":
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
  shelf = "home",
}: {
  userId: string;
  shelf?: LibraryShelf;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const selectedBookId = bookIdFromLibraryPath(pathname);

  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentBook, setCurrentBook] = useState<LibraryBook | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [reviewBook, setReviewBook] = useState<LibraryBook | null>(null);
  const priorityCoverIdRef = useRef<string | null>(null);

  useEffect(() => {
    priorityCoverIdRef.current = selectedBookId;
  }, [selectedBookId]);

  // Load shared catalog + personal shelf from the API (cloud source of truth).
  useEffect(() => {
    let cancelled = false;
    const signal = { cancelled: false };
    void (async () => {
      try {
        await migrateLocalBooks().catch(console.error);
        const loaded = await fetchLibraryBooks();
        if (cancelled) return;
        setBooks(loaded);
        void enrichEpubPdfCovers(
          loaded,
          (bookId, coverImage) => {
            if (signal.cancelled) return;
            setBooks((prev) =>
              prev.map((b) =>
                b.id === bookId && !b.coverImage ? { ...b, coverImage } : b,
              ),
            );
          },
          signal,
          priorityCoverIdRef.current,
        );
        void enrichCatalogTitles(
          loaded,
          (bookId, meta) => {
            if (signal.cancelled) return;
            setBooks((prev) =>
              prev.map((b) =>
                b.id === bookId
                  ? {
                      ...b,
                      ...(meta.title ? { title: meta.title } : {}),
                      ...(meta.author ? { author: meta.author } : {}),
                    }
                  : b,
              ),
            );
          },
          signal,
          priorityCoverIdRef.current,
        );
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      signal.cancelled = true;
    };
  }, [userId]);

  const reload = useCallback(async () => {
    await migrateLocalBooks().catch(console.error);
    const loaded = await fetchLibraryBooks();
    setBooks(loaded);
  }, []);

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

  const selectedBook = useMemo(() => {
    if (!selectedBookId) return null;
    return books.find((b) => b.id === selectedBookId) ?? null;
  }, [books, selectedBookId]);
  const selectedCoverReady = Boolean(selectedBook?.coverImage);

  useEffect(() => {
    if (!selectedBookId || !selectedBook || selectedCoverReady) return;
    const book = selectedBook;
    let cancelled = false;
    void ensureCover(book).then((cover) => {
      if (cancelled || !cover) return;
      setBooks((prev) =>
        prev.map((b) =>
          b.id === book.id && !b.coverImage ? { ...b, coverImage: cover } : b,
        ),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [selectedBook, selectedBookId, selectedCoverReady]);

  const closeDetail = useCallback(() => {
    router.push(libraryPath(null, shelf), { scroll: false });
  }, [router, shelf]);

  const openDetail = (book: LibraryBook) => {
    router.push(libraryPath(book.id, shelf), { scroll: false });
  };

  const closeReader = useCallback(() => {
    setCurrentBook(null);
    if (shelf !== "home") {
      router.push(libraryPath(null, shelf), { scroll: false });
    }
  }, [router, shelf]);

  const onResolvedMeta = useCallback(
    (meta: { title?: string; author?: string }) => {
      if (!selectedBookId) return;
      setBooks((prev) =>
        prev.map((b) =>
          b.id === selectedBookId
            ? {
                ...b,
                ...(meta.title ? { title: meta.title } : {}),
                ...(meta.author ? { author: meta.author } : {}),
              }
            : b,
        ),
      );
    },
    [selectedBookId],
  );

  const patchBook = async (
    book: LibraryBook,
    patch: Parameters<typeof updateShelfEntry>[1],
    local: Partial<LibraryBook>,
  ) => {
    setBooks((prev) =>
      prev.map((b) => (b.id === book.id ? { ...b, ...local } : b)),
    );
    setMenuOpenId(null);
    try {
      const entry = await updateShelfEntry(book.id, patch);
      setBooks((prev) =>
        prev.map((b) => {
          if (b.id !== book.id) return b;
          const next = applyShelfEntry(b, entry);
          return {
            ...next,
            ...(typeof entry.averageRating === "number"
              ? {
                  averageRating: entry.averageRating,
                  ratingCount: entry.ratingCount ?? b.ratingCount,
                }
              : {}),
          };
        }),
      );
    } catch (err) {
      console.error(err);
      await reload().catch(console.error);
    }
  };

  const openBook = async (
    book: LibraryBook,
    opts?: { revertUrlOnError?: boolean },
  ) => {
    if (openingId) return;
    setOpeningId(book.id);
    try {
      const opened = await openLibraryBook(book);
      setBooks((prev) =>
        prev.map((b) =>
          b.id === book.id
            ? {
                ...b,
                inMyLibrary: true,
                lastOpenedAt: opened.lastOpenedAt,
                coverImage: opened.coverImage ?? b.coverImage,
                progressPercent: opened.progressPercent ?? b.progressPercent,
                lastReadPage: opened.lastReadPage ?? b.lastReadPage,
                locator: opened.locator ?? b.locator,
                rating: opened.rating ?? b.rating,
                favorite: opened.favorite ?? b.favorite,
                status: opened.status ?? b.status,
                title: opened.title,
                author: opened.author,
              }
            : b,
        ),
      );
      setCurrentBook(opened);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not open this book.");
      if (opts?.revertUrlOnError) {
        router.replace(libraryPath(null, shelf), { scroll: false });
      }
    } finally {
      setOpeningId(null);
    }
  };

  const openFromShelf = (book: LibraryBook) => {
    router.push(libraryPath(book.id, shelf), { scroll: false });
    void openBook(book, { revertUrlOnError: true });
  };

  const onProgress = useCallback((progress: ReadingProgressUpdate) => {
    setCurrentBook((cur) => {
      if (!cur) return cur;
      const updated: LibraryBook = {
        ...cur,
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
      setBooks((prev) =>
        prev.map((b) =>
          b.id === updated.id
            ? {
                ...b,
                inMyLibrary: true,
                lastReadPage: updated.lastReadPage,
                totalPages: updated.totalPages,
                progressPercent: updated.progressPercent,
                locator: updated.locator,
                lastOpenedAt: updated.lastOpenedAt,
                status: updated.status,
              }
            : b,
        ),
      );
      void updateShelfEntry(updated.id, { progress }).catch(console.error);
      return updated;
    });
  }, []);

  const isHome = shelf === "home";
  const showDetail = isHome && Boolean(selectedBookId) && !currentBook;

  const overlays = (
    <>
      {showDetail ? (
        <BookDetailOverlay
          book={selectedBook}
          catalogReady={!loading}
          onClose={closeDetail}
          onRead={() => {
            if (selectedBook) void openBook(selectedBook);
          }}
          onToggleFavorite={() => {
            if (!selectedBook) return;
            const next = !selectedBook.favorite;
            void patchBook(
              selectedBook,
              {
                favorite: next,
                ...(next ? { inMyLibrary: true } : {}),
              },
              {
                favorite: next,
                ...(next ? { inMyLibrary: true } : {}),
              },
            );
          }}
          onAddToShelf={() => {
            if (!selectedBook || isInMyLibrary(selectedBook)) return;
            void patchBook(
              selectedBook,
              { inMyLibrary: true },
              { inMyLibrary: true },
            );
          }}
          reading={Boolean(openingId)}
          onResolvedMeta={onResolvedMeta}
        />
      ) : null}

      <RateReviewDialog
        book={
          reviewBook
            ? (books.find((b) => b.id === reviewBook.id) ?? reviewBook)
            : null
        }
        open={Boolean(reviewBook)}
        onOpenChange={(open) => {
          if (!open) setReviewBook(null);
        }}
        onSave={(payload) => {
          if (!reviewBook) return;
          void patchBook(reviewBook, payload, payload);
        }}
        onDelete={() => {
          if (!reviewBook) return;
          void patchBook(
            reviewBook,
            { rating: 0, reviewTitle: "", reviewBody: "" },
            { rating: 0, reviewTitle: "", reviewBody: "" },
          );
        }}
      />
    </>
  );

  if (currentBook) {
    return (
      <>
        <BookReader
          book={currentBook}
          userId={userId}
          onClose={closeReader}
          onProgress={onProgress}
        />
        {overlays}
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]"
          aria-busy
          aria-label="Loading book collection"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex flex-col">
              <Skeleton
                className="w-full rounded-sm"
                style={{ aspectRatio: "210 / 297" }}
              />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </div>
          ))}
        </div>
        {overlays}
      </>
    );
  }

  if (visibleBooks.length === 0) {
    const emptyLabel =
      shelf === "home" ? "No books yet" : "No books on this shelf";
    return (
      <>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-navy/40">
            <BookOpen className="size-8" />
          </div>
          <p className="text-[1.1rem] font-semibold text-foreground">
            {emptyLabel}
          </p>
        </div>
        {overlays}
      </>
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

          const menuItems: BookCardMenuItem[] = isHome
            ? [
                ...(!saved
                  ? [
                      {
                        label: "Add to My Books",
                        onSelect: () =>
                          void patchBook(
                            book,
                            { inMyLibrary: true },
                            { inMyLibrary: true },
                          ),
                      },
                    ]
                  : []),
                {
                  label: book.favorite
                    ? "Remove Favorite"
                    : "Add to Favorite",
                  onSelect: () =>
                    void patchBook(
                      book,
                      {
                        favorite: !book.favorite,
                        ...(book.favorite ? {} : { inMyLibrary: true }),
                      },
                      {
                        favorite: !book.favorite,
                        ...(book.favorite ? {} : { inMyLibrary: true }),
                      },
                    ),
                },
                {
                  label: "Add to Want to Read",
                  onSelect: () =>
                    void patchBook(
                      book,
                      { status: "want", inMyLibrary: true },
                      { status: "want", inMyLibrary: true },
                    ),
                },
              ]
            : [
                {
                  label: "Rate and Review",
                  onSelect: () => {
                    setMenuOpenId(null);
                    setReviewBook(book);
                  },
                },
                {
                  label: book.favorite
                    ? "Remove Favorite"
                    : "Add to Favorite",
                  onSelect: () =>
                    void patchBook(
                      book,
                      {
                        favorite: !book.favorite,
                        ...(book.favorite ? {} : { inMyLibrary: true }),
                      },
                      {
                        favorite: !book.favorite,
                        ...(book.favorite ? {} : { inMyLibrary: true }),
                      },
                    ),
                },
                {
                  label: "Want to Read",
                  onSelect: () =>
                    void patchBook(
                      book,
                      { status: "want", inMyLibrary: true },
                      { status: "want", inMyLibrary: true },
                    ),
                },
                {
                  label: "Delete",
                  danger: true,
                  onSelect: () => {
                    const cleared = removeFromMyLibrary(book);
                    setBooks((prev) =>
                      prev.map((b) =>
                        b.id === book.id ? { ...b, ...cleared } : b,
                      ),
                    );
                    setMenuOpenId(null);
                    void removeShelfEntry(book.id)
                      .then((entry) => {
                        setBooks((prev) =>
                          prev.map((b) =>
                            b.id === book.id
                              ? applyShelfEntry(
                                  { ...b, ...removeFromMyLibrary(b) },
                                  entry,
                                )
                              : b,
                          ),
                        );
                      })
                      .catch(async (err) => {
                        console.error(err);
                        await reload().catch(console.error);
                      });
                  },
                },
              ];

          return (
            <BookCard
              key={book.id}
              book={book}
              onOpen={() =>
                isHome ? openDetail(book) : openFromShelf(book)
              }
              showProgress={!isHome}
              showRating={false}
              menuOpen={menuOpenId === book.id}
              onMenuOpenChange={(open) =>
                setMenuOpenId(open ? book.id : null)
              }
              menuItems={menuItems}
            />
          );
        })}
      </div>

      {overlays}
    </>
  );
}
