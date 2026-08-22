import type { BookRating } from "@/lib/books";

export type ReviewVote = "up" | "down";

export type ReviewSort = "highest" | "lowest" | "newest" | "oldest" | "helpful";

export const REVIEW_SORT_LABELS: Record<ReviewSort, string> = {
  highest: "Highest rating",
  lowest: "Lowest rating",
  newest: "Most recent",
  oldest: "Oldest",
  helpful: "Most helpful",
};

export type RatingDistribution = {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
};

export type BookReview = {
  id: string;
  authorName: string;
  rating: BookRating;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  helpfulCount: number;
  notHelpfulCount: number;
  myVote: ReviewVote | null;
  isMine: boolean;
};

export type BookReviewsPayload = {
  averageRating: number;
  ratingCount: number;
  distribution: RatingDistribution;
  reviews: BookReview[];
};

export type ReviewDoc = {
  uid: string;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  votes?: Record<string, ReviewVote>;
};

export function emptyDistribution(): RatingDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

export function distributionFromRatings(
  ratings: number[],
): RatingDistribution {
  const dist = emptyDistribution();
  for (const n of ratings) {
    if (n === 1 || n === 2 || n === 3 || n === 4 || n === 5) dist[n] += 1;
  }
  return dist;
}

export function voteCounts(votes: Record<string, ReviewVote> | undefined): {
  helpfulCount: number;
  notHelpfulCount: number;
} {
  let helpfulCount = 0;
  let notHelpfulCount = 0;
  for (const vote of Object.values(votes ?? {})) {
    if (vote === "up") helpfulCount += 1;
    else if (vote === "down") notHelpfulCount += 1;
  }
  return { helpfulCount, notHelpfulCount };
}

export function displayNameFromUser(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const named = user.name?.trim();
  if (named) return named;
  const email = user.email?.trim() ?? "";
  if (email.includes("@")) return email.split("@")[0]!;
  return email || "Reader";
}

export function hasWrittenReview(title: string, body: string): boolean {
  return title.trim().length > 0 || body.trim().length > 0;
}

export function truncateReviewBody(
  body: string,
  max = 140,
): { text: string; truncated: boolean } {
  const trimmed = body.trim();
  if (trimmed.length <= max) return { text: trimmed, truncated: false };
  const slice = trimmed.slice(0, max);
  const at = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"));
  const text = `${(at > 60 ? slice.slice(0, at) : slice).trimEnd()}…`;
  return { text, truncated: true };
}

export function sortReviews(
  reviews: BookReview[],
  sort: ReviewSort,
): BookReview[] {
  const copy = [...reviews];
  copy.sort((a, b) => {
    switch (sort) {
      case "highest":
        return b.rating - a.rating || b.createdAt.localeCompare(a.createdAt);
      case "lowest":
        return a.rating - b.rating || b.createdAt.localeCompare(a.createdAt);
      case "newest":
        return b.createdAt.localeCompare(a.createdAt);
      case "oldest":
        return a.createdAt.localeCompare(b.createdAt);
      case "helpful":
        // Net helpful votes (up minus down), then raw ups, then rating, then recency.
        return (
          helpfulScore(b) - helpfulScore(a) ||
          b.helpfulCount - a.helpfulCount ||
          b.rating - a.rating ||
          b.createdAt.localeCompare(a.createdAt)
        );
    }
  });
  return copy;
}

export function helpfulScore(review: Pick<BookReview, "helpfulCount" | "notHelpfulCount">): number {
  return review.helpfulCount - review.notHelpfulCount;
}

export const PREVIEW_REVIEW_LIMIT = 6;
