"use client";

import { useState } from "react";

import { BookCover } from "@/components/book-cover";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BookRating, LibraryBook } from "@/lib/books";

export type RateReviewPayload = {
  rating: BookRating;
  reviewTitle: string;
  reviewBody: string;
};

type RateReviewDialogProps = {
  book: LibraryBook | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (payload: RateReviewPayload) => void;
  onDelete: () => void;
};

export function RateReviewDialog({
  book,
  open,
  onOpenChange,
  onSave,
  onDelete,
}: RateReviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {book && open ? (
        <RateReviewForm
          key={book.id}
          book={book}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </Dialog>
  );
}

function RateReviewForm({
  book,
  onSave,
  onDelete,
  onClose,
}: {
  book: LibraryBook;
  onSave: (payload: RateReviewPayload) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [rating, setRating] = useState<BookRating>(
    (book.rating ?? 0) as BookRating,
  );
  const [reviewTitle, setReviewTitle] = useState(book.reviewTitle ?? "");
  const [reviewBody, setReviewBody] = useState(book.reviewBody ?? "");

  const canSubmit =
    rating > 0 || reviewTitle.trim().length > 0 || reviewBody.trim().length > 0;

  return (
    <DialogContent
      showCloseButton={false}
      className="w-full max-w-[min(100%-2rem,28rem)] gap-4 p-5 sm:max-w-md"
    >
      <div className="flex items-start gap-3">
        <BookCover
          book={book}
          className="h-[72px] w-[52px] shrink-0 rounded-md shadow-sm"
        />
        <div className="min-w-0 flex-1 space-y-2 pt-0.5">
          <DialogTitle className="text-[1.05rem] font-semibold">
            Write a review…
          </DialogTitle>
          <DialogDescription className="sr-only">
            Rate this book from 1 to 5 stars and optionally write a review.
          </DialogDescription>
          <StarRating
            value={rating}
            onChange={setRating}
            size="lg"
            label="Your rating"
          />
        </div>
      </div>

      <div className="space-y-2.5">
        <Input
          value={reviewTitle}
          onChange={(e) => setReviewTitle(e.target.value)}
          placeholder="Review Title"
          maxLength={200}
          aria-label="Review title"
          className="h-10 rounded-lg"
        />
        <Textarea
          value={reviewBody}
          onChange={(e) => setReviewBody(e.target.value)}
          placeholder="Tell others what you liked (or didn't like) about this book..."
          maxLength={8000}
          aria-label="Review"
          className="min-h-28 resize-y rounded-lg"
        />
      </div>

      <div className="flex items-center justify-between gap-2 pt-1">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          Delete
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              onSave({
                rating,
                reviewTitle: reviewTitle.trim(),
                reviewBody: reviewBody.trim(),
              });
              onClose();
            }}
          >
            Submit
          </Button>
        </div>
      </div>
    </DialogContent>
  );
}
