import { NextResponse } from "next/server";

import type {
  BookRating,
  BookStatus,
  ReadingLocator,
  ReadingProgressUpdate,
} from "@/lib/books";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  applyCatalogRatingDelta,
  booksCollection,
  shelfEntryFromDoc,
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
  progress?: ReadingProgressUpdate;
  lastOpenedAt?: string | null;
  locator?: ReadingLocator | null;
};

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

  const hasUpdate =
    typeof patch.archived === "boolean" ||
    patch.markRead === true ||
    typeof patch.inMyLibrary === "boolean" ||
    typeof patch.favorite === "boolean" ||
    patch.status !== undefined ||
    isBookRating(patch.rating) ||
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
  const existing = await ref.get();
  const prevRating = Number((existing.data() as UserBookDoc | undefined)?.rating ?? 0);

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
    catalogRating = await applyCatalogRatingDelta(bookId, prevRating, patch.rating);
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
  // Soft-remove from My Library — keep the doc so progress can remain if re-added.
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
