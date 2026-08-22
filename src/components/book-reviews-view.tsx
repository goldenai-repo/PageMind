"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Star, ChevronLeft } from "lucide-react";

import { BookReviewCard } from "@/components/book-review-card";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchBookReviews } from "@/lib/library-api";
import {
  REVIEW_SORT_LABELS,
  sortReviews,
  type BookReview,
  type BookReviewsPayload,
  type RatingDistribution,
  type ReviewSort,
} from "@/lib/reviews";

export function BookReviewsView({
  bookId,
  onBack,
}: {
  bookId: string;
  onBack: () => void;
}) {
  const [sort, setSort] = useState<ReviewSort>("highest");
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; data: BookReviewsPayload }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    void fetchBookReviews(bookId)
      .then((data) => {
        if (!cancelled) setState({ status: "ready", data });
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
  }, [bookId]);

  const reviews = useMemo(() => {
    if (state.status !== "ready") return [];
    return sortReviews(state.data.reviews, sort);
  }, [state, sort]);

  const replaceReview = (next: BookReview) => {
    setState((prev) => {
      if (prev.status !== "ready") return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          reviews: prev.data.reviews.map((r) =>
            r.id === next.id ? next : r,
          ),
        },
      };
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="relative flex shrink-0 items-center justify-center px-12 py-4">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          aria-label="Back to book"
          onClick={onBack}
          className="absolute top-1/2 left-4 -translate-y-1/2 rounded-full"
        >
          <ChevronLeft />
        </Button>
        <DialogTitle className="text-[1.05rem] font-semibold">
          Customer Reviews
        </DialogTitle>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-8">
        {state.status === "loading" ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </div>
        ) : state.status === "error" ? (
          <p className="text-sm text-muted-foreground">{state.message}</p>
        ) : (
          <>
            <RatingSummary
              average={state.data.averageRating}
              count={state.data.ratingCount}
              distribution={state.data.distribution}
            />

            <div className="mt-8 mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold">Reviews</h3>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="secondary" size="sm" />}
                >
                  Sort
                  <ChevronDown />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuRadioGroup
                    value={sort}
                    onValueChange={(value) => {
                      if (
                        typeof value === "string" &&
                        value in REVIEW_SORT_LABELS
                      ) {
                        setSort(value as ReviewSort);
                      }
                    }}
                  >
                    {(Object.keys(REVIEW_SORT_LABELS) as ReviewSort[]).map(
                      (key) => (
                        <DropdownMenuRadioItem key={key} value={key}>
                          {REVIEW_SORT_LABELS[key]}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {reviews.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No written reviews yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {reviews.map((review) => (
                  <div key={review.id} id={`review-${review.id}`}>
                    <BookReviewCard
                      bookId={bookId}
                      review={review}
                      variant="full"
                      onVote={replaceReview}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function RatingSummary({
  average,
  count,
  distribution,
}: {
  average: number;
  count: number;
  distribution: RatingDistribution;
}) {
  const max = Math.max(1, ...Object.values(distribution));
  return (
    <div className="flex items-start gap-5 sm:gap-8">
      <div className="shrink-0 pt-0.5">
        <p className="text-5xl font-semibold tracking-tight tabular-nums">
          {count > 0 ? average.toFixed(1) : "—"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">out of 5</p>
      </div>
      <div className="min-w-0 flex-1">
        {([5, 4, 3, 2, 1] as const).map((star) => (
          <div
            key={star}
            className="flex h-5 items-center gap-2"
            aria-label={`${star} star${star === 1 ? "" : "s"}: ${distribution[star]} ${distribution[star] === 1 ? "rating" : "ratings"}`}
          >
            <div className="flex w-[4.75rem] shrink-0 items-center justify-start gap-px">
              {Array.from({ length: star }, (_, i) => (
                <Star
                  key={i}
                  className="size-2.5 fill-foreground/75 text-foreground/75"
                />
              ))}
            </div>
            <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-foreground/70"
                style={{
                  width: `${count > 0 ? (distribution[star] / max) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        ))}
        <p className="mt-1 text-right text-sm text-muted-foreground">
          {count} {count === 1 ? "Rating" : "Ratings"}
        </p>
      </div>
    </div>
  );
}
