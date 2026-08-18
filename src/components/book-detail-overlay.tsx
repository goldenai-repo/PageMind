"use client";

import { Heart, Library, XIcon } from "lucide-react";

import { BookCover } from "@/components/book-cover";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
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
}: BookDetailOverlayProps) {
  const averageRating = book?.averageRating ?? 0;
  const ratingCount = book?.ratingCount ?? 0;
  const pages = book?.totalPages;
  const favorited = Boolean(book?.favorite);
  const onShelf = book ? isInMyLibrary(book) : false;

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
                  {book.title}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  {FORMAT_LABEL[book.ext]}. Average rating {averageRating.toFixed(1)}
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
            <div className="mt-3 min-h-24" />
          </section>
          <section aria-labelledby="book-review-heading" className="mt-8">
            <h3
              id="book-review-heading"
              className="text-[0.95rem] font-semibold text-foreground"
            >
              Review
            </h3>
            <div className="mt-3 min-h-24" />
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
