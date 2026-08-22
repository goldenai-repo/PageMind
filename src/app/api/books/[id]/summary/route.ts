import { NextResponse } from "next/server";

import { extractBookIdentity, humanizeFileTitle, looksLikeFileStemTitle } from "@/lib/book-metadata";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  fetchGoogleBookSummary,
  GOOGLE_SUMMARY_MATCHER_VERSION,
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

function nicerTitle(next: string, current: string): boolean {
  return Boolean(next) && next !== current;
}

function toJson(
  cache: GoogleSummaryCache,
  meta: { title: string; author?: string },
): BookSummaryJson {
  if (!cache.text) {
    return {
      text: null,
      source: null,
      infoLink: null,
      author: meta.author ?? null,
      title: meta.title,
    };
  }
  return {
    text: cache.text,
    source: "google-books",
    infoLink: cache.infoLink ?? null,
    author: meta.author ?? null,
    title: meta.title,
  };
}

function queryKey(title: string, author?: string): string {
  return `${title}\n${author ?? ""}`;
}

function isFresh(
  cache: GoogleSummaryCache | undefined,
  key: string,
  catalogTitle: string,
): cache is GoogleSummaryCache {
  if (!cache?.fetchedAt) return false;
  if (cache.queryKey && cache.queryKey !== key) return false;
  if (
    cache.matcherVersion !== GOOGLE_SUMMARY_MATCHER_VERSION &&
    !cache.text
  ) {
    return false;
  }
  if (cache.text) {
    if (looksLikeFileStemTitle(catalogTitle) && !cache.title) return false;
    return true;
  }
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

  let title = doc.title;
  let author = doc.author?.trim() || undefined;

  if (doc.titleSource !== "metadata") {
    const nicer = humanizeFileTitle(doc.title);
    if (nicer && nicer !== doc.title) {
      title = nicer;
    }
  }

  const needsFileTitle =
    (doc.ext === "epub" || doc.ext === "pdf") &&
    doc.titleSource !== "metadata" &&
    doc.titleSource !== "google-books";
  const needsAuthor = !author && (doc.ext === "epub" || doc.ext === "pdf");

  if (needsFileTitle || needsAuthor) {
    try {
      const bytes = await loadBookFile(id, doc);
      const identity = await extractBookIdentity(
        doc.ext,
        bytes,
        `${doc.title}.${doc.ext}`,
      );
      const patch: Partial<BookDoc> = {};
      if (identity.titleSource === "metadata" && identity.title) {
        title = identity.title;
        patch.title = identity.title;
        patch.titleSource = "metadata";
      } else if (nicerTitle(title, doc.title) && !needsFileTitle) {
        // Keep a humanized search hint only when we already decided not to
        // replace from file metadata.
        patch.title = title;
        patch.titleSource = "filename";
      }
      if (!author && identity.author) {
        author = identity.author;
        patch.author = identity.author;
      }
      if (
        (doc.ext === "epub" || doc.ext === "pdf") &&
        identity.titleSource !== "metadata"
      ) {
        patch.titleSource = patch.titleSource ?? "filename";
      }
      if (Object.keys(patch).length > 0) {
        await ref.set(patch, { merge: true });
      }
    } catch (err) {
      console.error(`Identity extract failed for ${id}:`, err);
    }
  }

  const key = queryKey(title, author);
  const cached = doc.googleSummary;
  if (isFresh(cached, key, title)) {
    const displayTitle =
      cached.title && doc.titleSource !== "metadata" ? cached.title : title;
    const displayAuthor = author;
    if (
      displayTitle !== doc.title &&
      doc.titleSource !== "metadata"
    ) {
      void ref.set(
        { title: displayTitle, titleSource: "google-books" },
        { merge: true },
      );
    }
    return NextResponse.json(
      toJson(cached, { title: displayTitle, author: displayAuthor }),
    );
  }

  const apiKey = googleBooksApiKey();

  try {
    const found = await fetchGoogleBookSummary({
      title,
      author,
      apiKey,
    });

    if (found?.authors[0] && !author) {
      author = found.authors[0];
    }
    if (
      found?.title &&
      doc.titleSource !== "metadata" &&
      found.title !== title
    ) {
      title = found.title;
    }

    const titlePatch: Partial<BookDoc> = {};
    if (found?.authors[0] && !doc.author) {
      titlePatch.author = found.authors[0];
    }
    if (found?.title && doc.titleSource !== "metadata") {
      titlePatch.title = found.title;
      titlePatch.titleSource = "google-books";
    } else if (
      !found &&
      doc.titleSource !== "metadata" &&
      doc.titleSource !== "google-books"
    ) {
      titlePatch.titleSource = "filename";
    }

    const cache: GoogleSummaryCache = found
      ? {
          text: found.text,
          title: found.title,
          infoLink: found.infoLink,
          volumeId: found.volumeId,
          fetchedAt: new Date().toISOString(),
          queryKey: queryKey(title, author),
          matcherVersion: GOOGLE_SUMMARY_MATCHER_VERSION,
        }
      : {
          text: null,
          title: null,
          fetchedAt: new Date().toISOString(),
          queryKey: queryKey(title, author),
          matcherVersion: GOOGLE_SUMMARY_MATCHER_VERSION,
        };
    await ref.set({ googleSummary: cache, ...titlePatch }, { merge: true });
    return NextResponse.json(toJson(cache, { title, author }));
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
