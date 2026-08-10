import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  booksCollection,
  deleteBookStorageObject,
  type BookDoc,
} from "@/lib/library-server";

/** Temporary admin helper: permanently remove a catalog book + its file. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const ref = booksCollection().doc(id);
  const snap = await ref.get();
  const doc = snap.data() as BookDoc | undefined;
  if (!doc) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  if (doc.storagePath) {
    await deleteBookStorageObject(doc.storagePath);
  }

  const chunks = await ref.collection("chunks").listDocuments();
  await Promise.all(chunks.map((c) => c.delete()));
  const tips = await ref.collection("tips").listDocuments();
  await Promise.all(tips.map((t) => t.delete()));
  await ref.delete();

  return NextResponse.json({ ok: true });
}
