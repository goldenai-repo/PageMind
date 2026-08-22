"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";

import { BookReviewCard } from "@/components/book-review-card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchBookReviews } from "@/lib/library-api";
import {
  PREVIEW_REVIEW_LIMIT,
  sortReviews,
  type BookReview,
} from "@/lib/reviews";

export function BookReviewsPreview({
  bookId,
  ready,
  onOpenAll,
}: {
  bookId: string | null;
  ready: boolean;
  onOpenAll?: () => void;
}) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "ready"; reviews: BookReview[] }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!ready || !bookId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void fetchBookReviews(bookId)
      .then((data) => {
        if (cancelled) return;
        setState({
          status: "ready",
          reviews: sortReviews(data.reviews, "highest").slice(
            0,
            PREVIEW_REVIEW_LIMIT,
          ),
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message:
            err instanceof Error ? err.message : "Could not load reviews.",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, ready]);

  const heading = (
    <h3 id="book-review-heading" className="text-[0.95rem] font-semibold">
      Customer Reviews
    </h3>
  );

  return (
    <section aria-labelledby="book-review-heading" className="mt-8">
      {onOpenAll ? (
        <button
          type="button"
          onClick={onOpenAll}
          className="group inline-flex items-center gap-0.5 text-foreground"
        >
          {heading}
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </button>
      ) : (
        heading
      )}

      {!ready || state.status === "idle" || state.status === "loading" ? (
        <div className="mt-3 flex gap-3 overflow-hidden">
          <Skeleton className="h-36 w-[220px] shrink-0 rounded-2xl" />
          <Skeleton className="h-36 w-[220px] shrink-0 rounded-2xl" />
        </div>
      ) : state.status === "error" ? (
        <p className="mt-3 text-sm text-muted-foreground">{state.message}</p>
      ) : state.reviews.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No reviews yet. Be the first to rate this book from My Library.
        </p>
      ) : (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
          {state.reviews.map((review) => (
            <BookReviewCard
              key={review.id}
              bookId={bookId!}
              review={review}
              variant="preview"
              onOpenAll={onOpenAll}
            />
          ))}
        </div>
      )}
    </section>
  );
}
