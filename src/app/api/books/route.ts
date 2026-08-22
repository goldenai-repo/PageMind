import { NextResponse } from "next/server";

import { extractBookIdentity } from "@/lib/book-metadata";
import { COVERS, formatSize, isBookExt } from "@/lib/books";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  fetchGoogleBookSummary,
  GOOGLE_SUMMARY_MATCHER_VERSION,
  googleBooksApiKey,
} from "@/lib/google-books";
import {
  bookMetaFromDoc,
  booksCollection,
  saveBookFile,
  type BookDoc,
} from "@/lib/library-server";
import { decodeText } from "@/lib/readers/decode-text";
import { detectTxtChapters } from "@/lib/readers/txt-chapters";

const MAX_BOOK_BYTES = 30 * 1024 * 1024;

function toArrayBuffer(bytes: Buffer): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const snapshot = await booksCollection().orderBy("addedAt").get();
  const books = snapshot.docs
    .map(bookMetaFromDoc)
    .filter((b) => b !== null);
  return NextResponse.json({ books });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!isBookExt(ext)) {
    return NextResponse.json(
      { error: `Unsupported format: .${ext}. Use PDF, EPUB, or TXT.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BOOK_BYTES) {
    return NextResponse.json(
      { error: "File too large (30 MB max)." },
      { status: 413 },
    );
  }

  const id = crypto.randomUUID();
  const bytes = Buffer.from(await file.arrayBuffer());
  const { storagePath } = await saveBookFile(id, bytes, ext);

  const count = (await booksCollection().count().get()).data().count;
  const identity = await extractBookIdentity(ext, bytes, file.name);

  let title = identity.title;
  let titleSource = identity.titleSource;
  let author = identity.author;
  let googleSummary: BookDoc["googleSummary"];

  try {
    const found = await fetchGoogleBookSummary({
      title: identity.title,
      author,
      apiKey: googleBooksApiKey(),
    });
    if (found) {
      if (found.authors[0] && !author) author = found.authors[0];
      if (found.title && identity.titleSource !== "metadata") {
        title = found.title;
        titleSource = "google-books";
      }
      googleSummary = {
        text: found.text,
        title: found.title,
        infoLink: found.infoLink,
        volumeId: found.volumeId,
        fetchedAt: new Date().toISOString(),
        queryKey: `${title}\n${author ?? ""}`,
        matcherVersion: GOOGLE_SUMMARY_MATCHER_VERSION,
      };
    }
  } catch (err) {
    console.error(`Google Books lookup failed for upload ${id}:`, err);
  }

  const txtChapters =
    ext === "txt"
      ? detectTxtChapters(decodeText(toArrayBuffer(bytes)))
      : undefined;

  const doc: BookDoc = {
    title,
    titleSource,
    ext,
    cover: COVERS[count % COVERS.length],
    size: formatSize(file.size),
    sizeBytes: file.size,
    addedAt: new Date().toISOString(),
    uploadedBy: user.uid,
    storagePath,
    ratingSum: 0,
    ratingCount: 0,
    ...(author ? { author } : {}),
    ...(googleSummary ? { googleSummary } : {}),
    ...(ext === "txt"
      ? { txtChapters: txtChapters ?? [], txtChaptersReady: true }
      : {}),
  };
  await booksCollection().doc(id).set(doc);

  return NextResponse.json(
    {
      book: {
        id,
        title: doc.title,
        ext,
        cover: doc.cover,
        size: doc.size,
        addedAt: doc.addedAt,
        averageRating: 0,
        ratingCount: 0,
        ...(doc.author ? { author: doc.author } : {}),
        ...(doc.titleSource ? { titleSource: doc.titleSource } : {}),
        ...(doc.txtChaptersReady ? { txtChapters: doc.txtChapters ?? [] } : {}),
      },
    },
    { status: 201 },
  );
}
