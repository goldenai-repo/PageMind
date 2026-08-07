import { NextResponse } from "next/server";

import { BOOK_MIME, isBookExt } from "@/lib/books";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  booksCollection,
  loadBookFile,
  type BookDoc,
} from "@/lib/library-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { id } = await params;
  const snap = await booksCollection().doc(id).get();
  const doc = snap.data() as BookDoc | undefined;
  if (!doc) {
    return NextResponse.json({ error: "Book not found." }, { status: 404 });
  }

  const bytes = await loadBookFile(id);
  const body = new Uint8Array(bytes).buffer;

  return new Response(body, {
    headers: {
      "Content-Type": isBookExt(doc.ext)
        ? BOOK_MIME[doc.ext]
        : "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
