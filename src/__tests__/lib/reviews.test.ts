// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { BookReview } from "@/lib/reviews";
import {
  distributionFromRatings,
  sortReviews,
  truncateReviewBody,
} from "@/lib/reviews";

function review(
  partial: Partial<BookReview> & Pick<BookReview, "id">,
): BookReview {
  return {
    authorName: "pat",
    rating: 3,
    title: "Ok",
    body: "Fine",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    helpfulCount: 0,
    notHelpfulCount: 0,
    myVote: null,
    isMine: false,
    ...partial,
  };
}

describe("sortReviews", () => {
  const a = review({
    id: "a",
    rating: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    helpfulCount: 1,
  });
  const b = review({
    id: "b",
    rating: 2,
    createdAt: "2026-06-01T00:00:00.000Z",
    helpfulCount: 4,
  });
  const c = review({
    id: "c",
    rating: 5,
    createdAt: "2026-03-01T00:00:00.000Z",
    helpfulCount: 0,
  });

  it("defaults to highest rating, then newest", () => {
    expect(sortReviews([a, b, c], "highest").map((r) => r.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("sorts lowest, newest, oldest, and most helpful", () => {
    expect(sortReviews([a, b, c], "lowest").map((r) => r.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortReviews([a, b, c], "newest").map((r) => r.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortReviews([a, b, c], "oldest").map((r) => r.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(sortReviews([a, b, c], "helpful").map((r) => r.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("sorts most helpful by net helpful votes", () => {
    const mixed = [
      review({ id: "loved", rating: 3, helpfulCount: 6, notHelpfulCount: 1 }),
      review({ id: "split", rating: 5, helpfulCount: 8, notHelpfulCount: 7 }),
    ];
    expect(sortReviews(mixed, "helpful").map((r) => r.id)).toEqual([
      "loved",
      "split",
    ]);
  });
});

describe("distributionFromRatings", () => {
  it("counts each star bucket", () => {
    expect(distributionFromRatings([5, 5, 4, 1])).toEqual({
      1: 1,
      2: 0,
      3: 0,
      4: 1,
      5: 2,
    });
  });
});

describe("truncateReviewBody", () => {
  it("leaves short text alone", () => {
    expect(truncateReviewBody("Short.")).toEqual({
      text: "Short.",
      truncated: false,
    });
  });

  it("truncates long text on a word boundary", () => {
    const body = "A Captivating Mississippi Story that goes on ".repeat(8);
    const result = truncateReviewBody(body, 80);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith("…")).toBe(true);
    expect(result.text.length).toBeLessThan(body.length);
  });
});
