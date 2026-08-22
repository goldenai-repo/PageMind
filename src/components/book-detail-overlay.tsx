"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, Library, XIcon } from "lucide-react";

import { BookCover } from "@/components/book-cover";
import { BookReviewsPreview } from "@/components/book-reviews-preview";
import { BookReviewsView } from "@/components/book-reviews-view";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate, isInMyLibrary, type LibraryBook } from "@/lib/books";
import {
  fetchBookSummary,
  type BookSummaryJson,
} from "@/lib/library-api";
import { cn } from "@/lib/utils";

type BookDetailOverlayProps = {
  book: LibraryBook | null;
  /** True after the catalog has loaded; used to distinguish missing vs pending. */
  catalogReady: boolean;
  onClose: () => void;
  onRead: () => void;
  onToggleFavorite: () => void;
  onAddToShelf: () => void;
  reading?: boolean;
  onResolvedMeta?: (meta: { title?: string; author?: string }) => void;
};

const FORMAT_LABEL: Record<LibraryBook["ext"], string> = {
  epub: "EPUB",
  pdf: "PDF",
  txt: "TXT",
};

export function BookDetailOverlay({
  book,
  catalogReady,
  onClose,
  onRead,
  onToggleFavorite,
  onAddToShelf,
  reading = false,
  onResolvedMeta,
}: BookDetailOverlayProps) {
  const averageRating = book?.averageRating ?? 0;
  const ratingCount = book?.ratingCount ?? 0;
  const pages = book?.totalPages;
  const favorited = Boolean(book?.favorite);
  const onShelf = book ? isInMyLibrary(book) : false;
  const [reviewsForId, setReviewsForId] = useState<string | null>(null);
  const [resolvedMeta, setResolvedMeta] = useState<{
    bookId: string;
    title?: string;
    author?: string;
  } | null>(null);

  const displayTitle =
    resolvedMeta?.bookId === book?.id
      ? resolvedMeta.title || book?.title
      : book?.title;
  const displayAuthor =
    resolvedMeta?.bookId === book?.id
      ? resolvedMeta.author || book?.author
      : book?.author;

  const bookId = book?.id;
  const onSummaryMeta = useCallback(
    (meta: { title?: string; author?: string }) => {
      if (!bookId) return;
      setResolvedMeta({ bookId, ...meta });
      onResolvedMeta?.(meta);
    },
    [bookId, onResolvedMeta],
  );
  const showReviews = Boolean(book && reviewsForId === book.id);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-navy-dark/35 backdrop-blur-[1px]"
        className="flex max-h-[min(82vh,760px)] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        {showReviews && book ? (
          <BookReviewsView
            bookId={book.id}
            onBack={() => setReviewsForId(null)}
          />
        ) : (
          <>
            <div className="relative bg-navy-dark px-5 pt-4 pb-8 text-white sm:px-8 sm:pt-5 sm:pb-10">
          <DialogClose
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                className="absolute top-3 left-3 text-white hover:bg-white/15 hover:text-white"
              />
            }
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </DialogClose>

          {!catalogReady ? (
            <div className="flex min-h-[220px] items-center justify-center pt-10">
              <DialogTitle className="sr-only">Loading book</DialogTitle>
              <div className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          ) : !book ? (
            <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 px-8 pt-10 text-center">
              <DialogTitle className="text-lg font-semibold text-white">
                Book not found
              </DialogTitle>
              <DialogDescription className="text-white/65">
                This title isn’t in the library, or the link is out of date.
              </DialogDescription>
            </div>
          ) : (
            <div className="mt-8 flex flex-col gap-6 sm:mt-6 sm:flex-row sm:items-start sm:gap-8">
              <BookCover
                key={book.id}
                book={book}
                className="relative mx-auto aspect-[210/297] w-[148px] shrink-0 rounded-sm shadow-[0_12px_40px_rgba(0,0,0,0.35)] sm:mx-0 sm:w-[168px]"
              />

              <div className="min-w-0 flex-1">
                <p className="text-[0.7rem] font-semibold tracking-[0.14em] text-white/55 uppercase">
                  {FORMAT_LABEL[book.ext]}
                </p>
                <DialogTitle className="mt-1 font-[family-name:var(--font-lora)] text-[1.75rem] leading-tight font-semibold text-white sm:text-[2rem]">
                  {displayTitle}
                </DialogTitle>
                {displayAuthor ? (
                  <p className="mt-1.5 text-[0.95rem] text-white/75">
                    {displayAuthor}
                  </p>
                ) : null}
                <DialogDescription className="sr-only">
                  {FORMAT_LABEL[book.ext]}
                  {displayAuthor ? ` by ${displayAuthor}` : ""}. Average rating{" "}
                  {averageRating.toFixed(1)}
                  {ratingCount > 0 ? ` from ${ratingCount} ratings` : ""}.{" "}
                  {formatDate(book.addedAt)}
                  {typeof pages === "number" && pages > 0
                    ? `, ${pages} pages`
                    : ""}
                  {book.size ? `, ${book.size}` : ""}.
                </DialogDescription>
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/80">
                  <StarRating
                    value={averageRating}
                    showValue
                    count={ratingCount}
                    onDark
                    label="Average rating"
                  />
                  <span aria-hidden className="text-white/35">
                    •
                  </span>
                  <span>
                    {formatDate(book.addedAt)}
                    {typeof pages === "number" && pages > 0
                      ? ` • ${pages} Pages`
                      : ""}
                    {book.size ? ` • ${book.size}` : ""}
                  </span>
                </div>

                <Separator className="my-5 bg-white/15" />

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="lg"
                    onClick={onRead}
                    disabled={reading}
                    className="rounded-full bg-white px-6 text-navy-dark hover:bg-white/90"
                  >
                    {reading ? "Opening…" : "Read"}
                  </Button>

                  <Tooltip>
                    <TooltipTrigger
                      delay={200}
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-lg"
                          aria-pressed={favorited}
                          aria-label={
                            favorited
                              ? "Remove from favorites"
                              : "Add to favorites"
                          }
                          onClick={onToggleFavorite}
                          className="text-white hover:bg-white/15 hover:text-white"
                        >
                          <Heart
                            className={cn(
                              "size-5",
                              favorited && "fill-red-500 text-red-500",
                            )}
                          />
                        </Button>
                      }
                    />
                    <TooltipContent className="z-[60]">
                      {favorited ? "Remove Favorite" : "Add to Favorite"}
                    </TooltipContent>
                  </Tooltip>

                  <Button
                    type="button"
                    variant="secondary"
                    size="lg"
                    onClick={onAddToShelf}
                    disabled={onShelf}
                    className="rounded-full bg-white/12 text-white hover:bg-white/20 hover:text-white disabled:bg-white/8 disabled:text-white/70"
                  >
                    <Library />
                    {onShelf ? "In My Books" : "Add to My Books"}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/40 px-5 py-6 sm:px-8 sm:py-8">
          <section aria-labelledby="book-summary-heading">
            <h3
              id="book-summary-heading"
              className="text-[0.95rem] font-semibold text-foreground"
            >
              Summary
            </h3>
            <BookSummaryBody
              key={book?.id ?? "none"}
              bookId={book?.id ?? null}
              ready={Boolean(book)}
              onMeta={onSummaryMeta}
            />
          </section>
          <BookReviewsPreview
            bookId={book?.id ?? null}
            ready={Boolean(book)}
            onOpenAll={book ? () => setReviewsForId(book.id) : undefined}
          />
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function BookSummaryBody({
  bookId,
  ready,
  onMeta,
}: {
  bookId: string | null;
  ready: boolean;
  onMeta?: (meta: { title?: string; author?: string }) => void;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; data: BookSummaryJson }
    | { status: "error"; message: string }
  >({ status: ready && bookId ? "loading" : "idle" });

  useEffect(() => {
    if (!ready || !bookId) return;
    let cancelled = false;
    void fetchBookSummary(bookId)
      .then((data) => {
        if (cancelled) return;
        setState({ status: "ready", data });
        if (data.title || data.author) {
          onMeta?.({
            ...(data.title ? { title: data.title } : {}),
            ...(data.author ? { author: data.author } : {}),
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof Error ? err.message : "Could not load summary.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, ready, onMeta]);

  if (!ready) {
    return <div className="mt-3 min-h-24" />;
  }

  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="mt-3 space-y-2" aria-busy="true" aria-live="polite">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[92%]" />
        <Skeleton className="h-4 w-[76%]" />
        <span className="sr-only">Loading summary</span>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {state.message}
      </p>
    );
  }

  if (!state.data.text) {
    return (
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        No summary found for this title.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <p className="whitespace-pre-wrap text-[0.925rem] leading-relaxed text-foreground/80">
        {state.data.text}
      </p>
      {state.data.source === "google-books" ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {state.data.infoLink ? (
            <a
              href={state.data.infoLink}
              target="_blank"
              rel="noreferrer"
              className="underline-offset-2 hover:underline"
            >
              From Google Books
            </a>
          ) : (
            "From Google Books"
          )}
        </p>
      ) : null}
    </div>
  );
}
