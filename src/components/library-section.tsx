"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, MoreHorizontal } from "lucide-react";

import { BookReader } from "@/components/book-reader";
import {
  formatDate,
  type BookStatus,
  type LibraryBook,
} from "@/lib/books";
import { loadBooks, saveBook } from "@/lib/storage";

function bookStatus(book: LibraryBook): BookStatus {
  return book.status ?? "want";
}

export function LibrarySection({
  userId,
  shelf = "all",
}: {
  userId: string;
  shelf?: "all" | BookStatus;
}) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [currentBook, setCurrentBook] = useState<LibraryBook | null>(null);
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
      .filter((b) => (shelf === "all" ? true : bookStatus(b) === shelf))
      .sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
  }, [books, shelf]);

  const setStatus = (book: LibraryBook, status: BookStatus) => {
    const updated = { ...book, status };
    setBooks((prev) => prev.map((b) => (b.id === book.id ? updated : b)));
    void saveBook(userId, updated);
    setMenuOpenId(null);
  };

  if (visibleBooks.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted text-navy/40">
          <BookOpen className="size-8" />
        </div>
        <p className="text-[1.1rem] font-semibold text-foreground">
          {shelf === "all" ? "Your library is empty" : "No books on this shelf"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-6"
        role="list"
        aria-label="Book collection"
      >
        {visibleBooks.map((book) => (
          <div key={book.id} className="relative" role="listitem">
            <button
              type="button"
              onClick={() => setCurrentBook(book)}
              className="group flex w-full flex-col overflow-hidden rounded-xl bg-card text-left shadow-[0_2px_10px_rgba(27,54,93,0.07)] outline-none transition-all hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(27,54,93,0.15)] focus-visible:ring-3 focus-visible:ring-navy/25"
              aria-label={`${book.title} — ${book.ext.toUpperCase()}`}
            >
              <div
                className="relative flex h-[210px] shrink-0 items-center justify-center overflow-hidden"
                style={{ background: book.cover }}
              >
                <div className="absolute inset-y-0 left-0 w-[13px] border-r border-white/10 bg-black/20" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_55%)]" />
                <BookOpen className="size-10 text-white opacity-40" />
                <span className="absolute right-2.5 bottom-2.5 rounded bg-black/30 px-1.5 py-0.5 text-[0.63rem] font-bold tracking-wider text-white/90 backdrop-blur-sm">
                  {book.ext.toUpperCase()}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 px-3.5 pt-3 pb-3.5">
                <p
                  className="line-clamp-2 text-[0.875rem] leading-snug font-semibold text-foreground"
                  title={book.title}
                >
                  {book.title}
                </p>
                <p className="truncate text-[0.72rem] text-muted-foreground">
                  {book.size} · {formatDate(book.addedAt)}
                </p>
              </div>
            </button>

            <div className="absolute top-2 right-2 z-10">
              <button
                type="button"
                aria-label={`Options for ${book.title}`}
                aria-expanded={menuOpenId === book.id}
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuOpenId((id) => (id === book.id ? null : book.id));
                }}
                className="flex size-8 items-center justify-center rounded-[6px] bg-white/90 text-navy shadow-[0_1px_4px_rgba(27,54,93,0.12)] backdrop-blur-sm hover:bg-white"
              >
                <MoreHorizontal className="size-4" />
              </button>
              {menuOpenId === book.id ? (
                <div
                  className="absolute top-full right-0 mt-1 min-w-40 overflow-hidden rounded-[6px] border border-border bg-white py-1 shadow-[0_8px_24px_rgba(27,54,93,0.12)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium text-foreground hover:bg-muted"
                    onClick={() => setStatus(book, "want")}
                  >
                    Want to Read
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium text-foreground hover:bg-muted"
                    onClick={() => setStatus(book, "finished")}
                  >
                    Finished
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {currentBook ? (
        <BookReader book={currentBook} onClose={() => setCurrentBook(null)} />
      ) : null}
    </>
  );
}
