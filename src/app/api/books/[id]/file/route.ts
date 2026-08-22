import { NextResponse } from "next/server";

import { BOOK_MIME, isBookExt } from "@/lib/books";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  booksCollection,
  loadBookFile,
  type BookDoc,
} from "@/lib/library-server";
import { decodeText } from "@/lib/readers/decode-text";
import { detectTxtChapters } from "@/lib/readers/txt-chapters";

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

  try {
    const bytes = await loadBookFile(id, doc);

    if (doc.ext === "txt" && !doc.txtChaptersReady) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const chapters = detectTxtChapters(decodeText(copy.buffer as ArrayBuffer));
      await booksCollection()
        .doc(id)
        .set(
          { txtChapters: chapters, txtChaptersReady: true },
          { merge: true },
        );
    }

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
  } catch (err) {
    console.error(`Failed to load book file ${id}:`, err);
    return NextResponse.json(
      { error: "Book file not found." },
      { status: 404 },
    );
  }
}
