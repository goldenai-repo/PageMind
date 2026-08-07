"use client";

import { useEffect, useMemo } from "react";
import { BookOpen, MoreHorizontal } from "lucide-react";

import { StarRating } from "@/components/star-rating";
import type { BookRating, LibraryBook } from "@/lib/books";
import { cn } from "@/lib/utils";

export type BookCardMenuItem = {
  label: string;
  onSelect: () => void;
  danger?: boolean;
};

type BookCardProps = {
  book: LibraryBook;
  onOpen: () => void;
  /** Show progress row (All Books / My Books). Hidden on Upload. */
  showProgress?: boolean;
  /** Show star row. */
  showRating?: boolean;
  /** When set, stars are interactive (My Books). Omit for All Books look-alike read-only. */
  onRate?: (rating: BookRating) => void;
  menuOpen?: boolean;
  onMenuOpenChange?: (open: boolean) => void;
  menuItems?: BookCardMenuItem[];
  className?: string;
};

/** A4 portrait ratio (210×297 mm). */
const A4_ASPECT = "210 / 297";

export function BookCard({
  book,
  onOpen,
  showProgress = false,
  showRating = false,
  onRate,
  menuOpen = false,
  onMenuOpenChange,
  menuItems,
  className,
}: BookCardProps) {
  const coverUrl = useMemo(() => {
    if (!book.coverImage) return null;
    return URL.createObjectURL(book.coverImage);
  }, [book.coverImage]);

  useEffect(() => {
    return () => {
      if (coverUrl) URL.revokeObjectURL(coverUrl);
    };
  }, [coverUrl]);

  const percent = book.progressPercent ?? 0;
  const hasProgress = Boolean(book.lastOpenedAt) || percent > 0;
  const rating = (book.rating ?? 0) as BookRating;
  const hasMenu = Boolean(menuItems?.length);

  return (
    <div className={cn("relative flex flex-col", className)} role="listitem">
      <button
        type="button"
        onClick={onOpen}
        className="group relative w-full overflow-hidden rounded-sm shadow-[0_2px_10px_rgba(27,54,93,0.07)] outline-none transition-all hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(27,54,93,0.15)] focus-visible:ring-3 focus-visible:ring-navy/25"
        style={{ aspectRatio: A4_ASPECT, background: book.cover }}
        aria-label={`${book.title} — ${book.ext.toUpperCase()}`}
      >
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob: URLs from IndexedDB
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
            draggable={false}
          />
        ) : (
          <>
            <div className="absolute inset-y-0 left-0 w-[10px] border-r border-white/10 bg-black/20" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_55%)]" />
            <BookOpen className="absolute top-1/2 left-1/2 size-10 -translate-x-1/2 -translate-y-1/2 text-white opacity-40" />
          </>
        )}

        {book.favorite ? (
          <span className="absolute top-2 left-2.5 z-[1] rounded bg-black/35 px-1.5 py-0.5 text-[0.63rem] font-bold tracking-wider text-white/90 backdrop-blur-sm">
            ★
          </span>
        ) : null}
        <span className="absolute right-2 bottom-2 z-[1] rounded bg-black/35 px-1.5 py-0.5 text-[0.63rem] font-bold tracking-wider text-white/90 backdrop-blur-sm">
          {book.ext.toUpperCase()}
        </span>
      </button>

      <p
        className="mt-2 line-clamp-2 px-0.5 text-[0.875rem] leading-snug font-semibold text-foreground"
        title={book.title}
      >
        {book.title}
      </p>

      {(showProgress || hasMenu) && (
        <div className="mt-2 flex items-center gap-2 px-0.5">
          {showProgress && hasProgress ? (
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

          {hasMenu ? (
            <div className="relative shrink-0">
              <button
                type="button"
                aria-label={`Options for ${book.title}`}
                aria-expanded={menuOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  onMenuOpenChange?.(!menuOpen);
                }}
                className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-navy"
              >
                <MoreHorizontal className="size-4" />
              </button>
              {menuOpen ? (
                <div
                  className="absolute top-full right-0 z-20 mt-1 min-w-48 overflow-hidden rounded-[6px] border border-border bg-white py-1 shadow-[0_8px_24px_rgba(27,54,93,0.12)]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {menuItems!.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={cn(
                        "block w-full px-3 py-1.5 text-left text-[0.82rem] font-medium hover:bg-muted",
                        item.danger
                          ? "text-red-600"
                          : "text-foreground",
                      )}
                      onClick={() => item.onSelect()}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}

      {showRating ? (
        <div className="mt-1.5 px-0.5">
          <StarRating
            value={rating}
            onChange={onRate}
            label={onRate ? "Your rating" : "Average rating"}
          />
        </div>
      ) : null}
    </div>
  );
}
