import { NextResponse } from "next/server";

import type {
  BookRating,
  BookStatus,
  ReadingLocator,
  ReadingProgressUpdate,
} from "@/lib/books";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  authorNameFromToken,
  booksCollection,
  setCatalogUserRating,
  shelfEntryFromDoc,
  syncPublicReview,
  userBooksCollection,
  type UserBookDoc,
} from "@/lib/library-server";

type ShelfPatch = {
  archived?: boolean;
  markRead?: boolean;
  inMyLibrary?: boolean;
  favorite?: boolean;
  status?: BookStatus | null;
  rating?: BookRating;
  reviewTitle?: string;
  reviewBody?: string;
  progress?: ReadingProgressUpdate;
  lastOpenedAt?: string | null;
  locator?: ReadingLocator | null;
};

const MAX_REVIEW_TITLE = 200;
const MAX_REVIEW_BODY = 8000;

function asReviewText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, max);
}

function isBookRating(value: unknown): value is BookRating {
  return (
    value === 0 ||
    value === 1 ||
    value === 2 ||
    value === 3 ||
    value === 4 ||
    value === 5
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let patch: ShelfPatch;
  try {
    patch = (await request.json()) as ShelfPatch;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const reviewTitle = asReviewText(patch.reviewTitle, MAX_REVIEW_TITLE);
  const reviewBody = asReviewText(patch.reviewBody, MAX_REVIEW_BODY);

  const hasUpdate =
    typeof patch.archived === "boolean" ||
    patch.markRead === true ||
    typeof patch.inMyLibrary === "boolean" ||
    typeof patch.favorite === "boolean" ||
    patch.status !== undefined ||
    isBookRating(patch.rating) ||
    reviewTitle !== undefined ||
    reviewBody !== undefined ||
    patch.progress != null ||
    patch.lastOpenedAt !== undefined ||
    patch.locator !== undefined;

  if (!hasUpdate) {
    return NextResponse.json(
      { error: "Nothing to update." },
      { status: 400 },
    );
  }

  const { bookId } = await params;
  const book = await booksCollection().doc(bookId).get();
  if (!book.exists) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const ref = userBooksCollection(user.uid).doc(bookId);

  const update: UserBookDoc = { updatedAt: now };

  if (typeof patch.archived === "boolean") update.archived = patch.archived;
  if (patch.markRead === true) update.lastReadAt = now;
  if (typeof patch.inMyLibrary === "boolean") {
    update.inMyLibrary = patch.inMyLibrary;
    if (!patch.inMyLibrary) {
      update.favorite = false;
      update.status = null;
    }
  }
  if (typeof patch.favorite === "boolean") {
    update.favorite = patch.favorite;
    if (patch.favorite) update.inMyLibrary = true;
  }
  if (patch.status !== undefined) {
    update.status = patch.status;
    if (patch.status === "want" || patch.status === "finished") {
      update.inMyLibrary = true;
    }
  }
  if (isBookRating(patch.rating)) update.rating = patch.rating;
  if (reviewTitle !== undefined) update.reviewTitle = reviewTitle;
  if (reviewBody !== undefined) update.reviewBody = reviewBody;
  if (patch.progress) {
    update.inMyLibrary = true;
    update.lastReadPage = patch.progress.lastReadPage;
    update.totalPages = patch.progress.totalPages;
    update.progressPercent = patch.progress.progressPercent;
    update.locator = patch.progress.locator;
    update.lastOpenedAt = now;
    update.lastReadAt = now;
    if (patch.progress.progressPercent >= 100) update.status = "finished";
  }
  if (patch.lastOpenedAt !== undefined) update.lastOpenedAt = patch.lastOpenedAt;
  if (patch.locator !== undefined) update.locator = patch.locator;

  await ref.set(update, { merge: true });

  let catalogRating: { averageRating: number; ratingCount: number } | undefined;
  if (isBookRating(patch.rating)) {
    catalogRating = await setCatalogUserRating(bookId, user.uid, patch.rating);
  }

  if (
    isBookRating(patch.rating) ||
    reviewTitle !== undefined ||
    reviewBody !== undefined
  ) {
    const latest = (await ref.get()).data() as UserBookDoc | undefined;
    await syncPublicReview(bookId, user.uid, authorNameFromToken(user), {
      rating: latest?.rating,
      reviewTitle: latest?.reviewTitle,
      reviewBody: latest?.reviewBody,
    });
  }

  return NextResponse.json({
    entry: shelfEntryFromDoc(await ref.get()),
    ...(catalogRating
      ? {
          averageRating: catalogRating.averageRating,
          ratingCount: catalogRating.ratingCount,
        }
      : {}),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { bookId } = await params;
  // Soft-remove from My Books only. Keep rating (and progress) so re-adding
  // restores the user's stars; Home average is unchanged.
  const ref = userBooksCollection(user.uid).doc(bookId);
  await ref.set(
    {
      inMyLibrary: false,
      favorite: false,
      status: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true },
  );
  return NextResponse.json({ ok: true, entry: shelfEntryFromDoc(await ref.get()) });
}
