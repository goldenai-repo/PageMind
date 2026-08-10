"use client";

import { Star } from "lucide-react";

import type { BookRating } from "@/lib/books";
import { cn } from "@/lib/utils";

type StarRatingProps = {
  /** 0–5; decimals allowed for community averages (e.g. 3.5). */
  value: number;
  /** When set, stars are clickable (personal integer ratings only). */
  onChange?: (rating: BookRating) => void;
  /** Show numeric average next to stars (Home). */
  showValue?: boolean;
  className?: string;
  label?: string;
};

function StarGlyph({ fill }: { fill: number }) {
  const portion = Math.max(0, Math.min(1, fill));
  return (
    <span className="relative inline-flex size-3.5 shrink-0">
      <Star
        className="absolute inset-0 size-3.5 text-amber-500 fill-transparent opacity-40"
        aria-hidden
      />
      {portion > 0 ? (
        <span
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${portion * 100}%` }}
        >
          <Star
            className="size-3.5 text-amber-500 fill-current"
            aria-hidden
          />
        </span>
      ) : null}
    </span>
  );
}

/**
 * Star row for Home (read-only average, partial fills) and My Library
 * (interactive personal rating).
 */
export function StarRating({
  value,
  onChange,
  showValue = false,
  className,
  label = "Book rating",
}: StarRatingProps) {
  const clamped = Math.max(0, Math.min(5, Number.isFinite(value) ? value : 0));
  const interactive = Boolean(onChange);
  // Interactive mode uses whole stars; read-only can show halves / decimals.
  const display = interactive ? Math.round(clamped) : clamped;

  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role={interactive ? "group" : "img"}
      aria-label={
        interactive
          ? label
          : `${label}: ${display > 0 ? `${display.toFixed(1)} of 5` : "No ratings yet"}`
      }
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5">
        {([1, 2, 3, 4, 5] as const).map((n) => {
          const fill = Math.max(0, Math.min(1, display - (n - 1)));
          const pressed = interactive && Math.round(clamped) >= n;

          if (!interactive) {
            return (
              <span key={n}>
                <StarGlyph fill={fill} />
              </span>
            );
          }

          return (
            <button
              key={n}
              type="button"
              aria-label={
                Math.round(clamped) === n
                  ? `Clear ${n} star rating`
                  : `Rate ${n} stars`
              }
              aria-pressed={pressed}
              className="inline-flex p-0 outline-none focus-visible:ring-2 focus-visible:ring-navy/25"
              onClick={() =>
                onChange?.(Math.round(clamped) === n ? 0 : n)
              }
            >
              <StarGlyph fill={fill} />
            </button>
          );
        })}
      </div>
      {showValue ? (
        <span className="text-[0.72rem] font-semibold tabular-nums text-muted-foreground">
          {display.toFixed(1)}
        </span>
      ) : null}
    </div>
  );
}
