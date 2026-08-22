import { NextResponse } from "next/server";

import { extractBookAuthor } from "@/lib/book-metadata";
import { COVERS, formatSize, isBookExt } from "@/lib/books";
import { getCurrentUser } from "@/lib/firebase/auth-server";
import {
  bookMetaFromDoc,
  booksCollection,
  saveBookFile,
  type BookDoc,
} from "@/lib/library-server";

const MAX_BOOK_BYTES = 30 * 1024 * 1024;

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
  const author = await extractBookAuthor(ext, bytes);
  const doc: BookDoc = {
    title: file.name.replace(/\.[^/.]+$/, ""),
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
      },
    },
    { status: 201 },
  );
}
