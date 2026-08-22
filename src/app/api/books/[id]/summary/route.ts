import { NextResponse } from "next/server";

import { extractBookAuthor } from "@/lib/book-metadata";
import { isBookExt } from "@/lib/books";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  fetchGoogleBookSummary,
  googleBooksApiKey,
  GoogleBooksError,
  type BookSummaryJson,
} from "@/lib/google-books";
import {
  booksCollection,
  loadBookFile,
  type BookDoc,
  type GoogleSummaryCache,
} from "@/lib/library-server";

const NEGATIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function toJson(cache: GoogleSummaryCache): BookSummaryJson {
  if (!cache.text) {
    return { text: null, source: null, infoLink: null };
  }
  return {
    text: cache.text,
    source: "google-books",
    infoLink: cache.infoLink ?? null,
  };
}

function isFresh(
  cache: GoogleSummaryCache | undefined,
): cache is GoogleSummaryCache {
  if (!cache?.fetchedAt) return false;
  if (cache.text) return true;
  const fetched = Date.parse(cache.fetchedAt);
  if (!Number.isFinite(fetched)) return false;
  return Date.now() - fetched < NEGATIVE_TTL_MS;
}

export async function GET(
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

  const cached = doc.googleSummary;
  if (isFresh(cached)) {
    return NextResponse.json(toJson(cached));
  }

  let author = doc.author?.trim() || undefined;
  const apiKey = googleBooksApiKey();

  try {
    let found = await fetchGoogleBookSummary({
      title: doc.title,
      author,
      apiKey,
    });

    if (!found && !author && isBookExt(doc.ext)) {
      try {
        const bytes = await loadBookFile(id, doc);
        author = await extractBookAuthor(doc.ext, bytes);
        if (author) {
          await ref.set({ author }, { merge: true });
          found = await fetchGoogleBookSummary({
            title: doc.title,
            author,
            apiKey,
          });
        }
      } catch (err) {
        console.error(`Author extract failed for ${id}:`, err);
      }
    }

    const cache: GoogleSummaryCache = found
      ? {
          text: found.text,
          infoLink: found.infoLink,
          volumeId: found.volumeId,
          fetchedAt: new Date().toISOString(),
        }
      : { text: null, fetchedAt: new Date().toISOString() };
    await ref.set({ googleSummary: cache }, { merge: true });
    return NextResponse.json(toJson(cache));
  } catch (err) {
    if (err instanceof GoogleBooksError && (err.status === 429 || err.status === 403)) {
      return NextResponse.json(
        { error: "Summary is temporarily unavailable." },
        { status: 503 },
      );
    }
    console.error(`Google Books summary failed for ${id}:`, err);
    return NextResponse.json(
      { error: "Could not load summary." },
      { status: 502 },
    );
  }
}
