"use client";

import { Star } from "lucide-react";

import type { BookRating } from "@/lib/books";
import { cn } from "@/lib/utils";

type StarRatingProps = {
  value: number;
  /** When set, stars are interactive (My Books). Omit for read-only avg display. */
  onChange?: (rating: BookRating) => void;
  className?: string;
  /** Accessible name, e.g. "Average rating" on All Books. */
  label?: string;
};

export function StarRating({
  value,
  onChange,
  className,
  label = "Book rating",
}: StarRatingProps) {
  const filledCount = Math.max(0, Math.min(5, Math.round(value)));
  const readOnly = !onChange;

  return (
    <div
      className={cn("flex items-center gap-0.5", className)}
      role={readOnly ? "img" : "group"}
      aria-label={
        readOnly
          ? `${label}: ${value > 0 ? `${value.toFixed(1)} of 5` : "No ratings yet"}`
          : label
      }
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {([1, 2, 3, 4, 5] as const).map((n) => {
        const filled = filledCount >= n;
        if (readOnly) {
          return (
            <Star
              key={n}
              className={cn(
                "size-3.5 text-amber-500",
                filled ? "fill-current" : "fill-transparent opacity-40",
              )}
              aria-hidden
            />
          );
        }
        return (
          <button
            key={n}
            type="button"
            aria-label={
              filledCount === n ? `Clear ${n} star rating` : `Rate ${n} stars`
            }
            aria-pressed={filled}
            className="rounded p-0.5 text-amber-500 outline-none hover:text-amber-600 focus-visible:ring-2 focus-visible:ring-navy/25"
            onClick={() => onChange(filledCount === n ? 0 : n)}
          >
            <Star
              className={cn(
                "size-3.5",
                filled ? "fill-current" : "fill-transparent opacity-40",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
