"use client";

import { Star } from "lucide-react";

import type { BookRating } from "@/lib/books";
import { cn } from "@/lib/utils";

type StarRatingProps = {
  value: number;
  /** When set, stars are clickable. Visual style matches read-only. */
  onChange?: (rating: BookRating) => void;
  className?: string;
  label?: string;
};

/**
 * Single star-row used on Home and My Library shelves.
 * Same look everywhere; interactivity is optional via onChange.
 */
export function StarRating({
  value,
  onChange,
  className,
  label = "Book rating",
}: StarRatingProps) {
  const filledCount = Math.max(0, Math.min(5, Math.round(value)));
  const interactive = Boolean(onChange);

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role={interactive ? "group" : "img"}
      aria-label={
        interactive
          ? label
          : `${label}: ${value > 0 ? `${value.toFixed(1)} of 5` : "No ratings yet"}`
      }
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {([1, 2, 3, 4, 5] as const).map((n) => {
        const filled = filledCount >= n;
        const star = (
          <Star
            className={cn(
              "size-3.5 text-amber-500",
              filled ? "fill-current" : "fill-transparent opacity-40",
            )}
            aria-hidden
          />
        );

        if (!interactive) {
          return <span key={n}>{star}</span>;
        }

        return (
          <button
            key={n}
            type="button"
            aria-label={
              filledCount === n ? `Clear ${n} star rating` : `Rate ${n} stars`
            }
            aria-pressed={filled}
            className="inline-flex p-0 outline-none focus-visible:ring-2 focus-visible:ring-navy/25"
            onClick={() => onChange?.(filledCount === n ? 0 : n)}
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}
