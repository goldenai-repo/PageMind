import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  authorNameFromToken,
  bookRatingsCollection,
  bookReviewsCollection,
  booksCollection,
  serializeReview,
  syncPublicReview,
  type BookDoc,
  type UserBookDoc,
  userBooksCollection,
} from "@/lib/library-server";
import {
  distributionFromRatings,
  type BookReviewsPayload,
  type ReviewDoc,
} from "@/lib/reviews";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const bookSnap = await booksCollection().doc(id).get();
  const book = bookSnap.data() as BookDoc | undefined;
  if (!book) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const [ratingsSnap, reviewsSnap, mineSnap] = await Promise.all([
    bookRatingsCollection(id).get(),
    bookReviewsCollection(id).get(),
    userBooksCollection(user.uid).doc(id).get(),
  ]);

  let reviewDocs = reviewsSnap;
  const mine = mineSnap.data() as UserBookDoc | undefined;
  const hasText =
    (mine?.reviewTitle ?? "").trim().length > 0 ||
    (mine?.reviewBody ?? "").trim().length > 0;
  const publicMine = reviewsSnap.docs.some((d) => d.id === user.uid);
  if (mine && hasText && !publicMine) {
    await syncPublicReview(id, user.uid, authorNameFromToken(user), {
      rating: mine.rating,
      reviewTitle: mine.reviewTitle,
      reviewBody: mine.reviewBody,
    });
    reviewDocs = await bookReviewsCollection(id).get();
  }

  const ratings: number[] = [];
  for (const doc of ratingsSnap.docs) {
    const n = Number((doc.data() as { rating?: number }).rating ?? 0);
    if (n >= 1 && n <= 5) ratings.push(n);
  }

  const ratingCount = Math.max(0, Math.floor(book.ratingCount ?? ratings.length));
  const ratingSum = Math.max(0, Number(book.ratingSum ?? 0));
  const averageRating =
    ratingCount > 0
      ? Math.round((ratingSum / ratingCount) * 10) / 10
      : ratings.length > 0
        ? Math.round(
            (ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10,
          ) / 10
        : 0;

  const payload: BookReviewsPayload = {
    averageRating,
    ratingCount: ratingCount || ratings.length,
    distribution: distributionFromRatings(ratings),
    reviews: reviewDocs.docs.map((doc) =>
      serializeReview(doc.id, doc.data() as ReviewDoc, user.uid),
    ),
  };
  return NextResponse.json(payload);
}
