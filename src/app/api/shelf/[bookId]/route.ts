import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  booksCollection,
  shelfCollection,
  shelfEntryFromDoc,
} from "@/lib/library-server";

type ShelfPatch = {
  archived?: boolean;
  markRead?: boolean;
};

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
  if (typeof patch.archived !== "boolean" && patch.markRead !== true) {
    return NextResponse.json(
      { error: "Nothing to update. Send archived and/or markRead." },
      { status: 400 },
    );
  }

  const { bookId } = await params;
  const book = await booksCollection().doc(bookId).get();
  if (!book.exists) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const now = new Date().toISOString();
  const update: Record<string, string | boolean> = { updatedAt: now };
  if (typeof patch.archived === "boolean") update.archived = patch.archived;
  if (patch.markRead === true) update.lastReadAt = now;

  const ref = shelfCollection(user.uid).doc(bookId);
  await ref.set(update, { merge: true });
  return NextResponse.json({ entry: shelfEntryFromDoc(await ref.get()) });
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
  await shelfCollection(user.uid).doc(bookId).delete();
  return NextResponse.json({ ok: true });
}
