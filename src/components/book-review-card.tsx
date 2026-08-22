"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";

import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/books";
import { voteOnReview } from "@/lib/library-api";
import type { BookReview, ReviewVote } from "@/lib/reviews";
import { truncateReviewBody } from "@/lib/reviews";
import { cn } from "@/lib/utils";

export function BookReviewCard({
  bookId,
  review,
  variant,
  onVote,
  onOpenAll,
}: {
  bookId: string;
  review: BookReview;
  variant: "preview" | "full";
  onVote?: (next: BookReview) => void;
  onOpenAll?: () => void;
}) {
  const preview =
    variant === "preview" ? truncateReviewBody(review.body) : null;

  return (
    <Card
      size="sm"
      className={cn(
        "gap-3 rounded-2xl bg-muted py-4 ring-0",
        variant === "preview" && "h-full w-[220px] shrink-0 sm:w-[240px]",
      )}
    >
      <div className="px-4">
        {review.title ? (
          <h4 className="font-heading text-[0.95rem] leading-snug font-semibold">
            {review.title}
          </h4>
        ) : null}
        {review.body ? (
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">
            {preview ? preview.text : review.body}
            {preview?.truncated ? (
              <>
                {" "}
                <button
                  type="button"
                  className="font-semibold text-foreground hover:underline"
                  onClick={onOpenAll}
                >
                  More
                </button>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          "flex items-center gap-2 px-4 text-xs text-muted-foreground",
          variant === "full" && "flex-wrap justify-between gap-y-2",
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <StarRating value={review.rating} label="Review rating" />
          <span>
            {formatDate(new Date(review.createdAt))}
            {review.authorName ? `, ${review.authorName}` : ""}
          </span>
        </div>

        {variant === "full" ? (
          <div className="flex items-center gap-0.5">
            <VoteButton
              label="Helpful"
              icon={ThumbsUp}
              active={review.myVote === "up"}
              disabled={review.isMine}
              onClick={() => void handleVote(bookId, review, "up", onVote)}
            />
            <VoteButton
              label="Not Helpful"
              icon={ThumbsDown}
              active={review.myVote === "down"}
              disabled={review.isMine}
              onClick={() => void handleVote(bookId, review, "down", onVote)}
            />
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function VoteButton({
  label,
  icon: Icon,
  active,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof ThumbsUp;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      disabled={disabled}
      aria-pressed={active}
      className={cn("text-muted-foreground", active && "text-navy")}
      onClick={onClick}
    >
      <Icon className={cn(active && "fill-current")} />
      {label}
    </Button>
  );
}

async function handleVote(
  bookId: string,
  review: BookReview,
  vote: ReviewVote,
  onVote?: (next: BookReview) => void,
) {
  try {
    const next = await voteOnReview(bookId, review.id, vote);
    onVote?.(next);
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Could not save vote.");
  }
}
