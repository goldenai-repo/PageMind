/**
 * Upload a local PDF/EPUB/TXT into the shared library catalog.
 * Run with:
 *   doppler run -- npx tsx scripts/upload-book.ts path/to/file.txt \
 *     --title "Title" --author "Author" --id <uuid>
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

import { BOOK_MIME, COVERS, formatSize, isBookExt } from "../src/lib/books";
import { decodeText } from "../src/lib/readers/decode-text";
import { detectTxtChapters } from "../src/lib/readers/txt-chapters";

function normalizeKey(raw: string): string {
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }
  return key.replace(/\\n/g, "\n").trim();
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const prefixed = process.argv.find((a) => a.startsWith(`${flag}=`));
  return prefixed?.slice(flag.length + 1);
}

function storageBucketName(): string {
  const raw =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
    "";
  return raw.replace(/^gs:\/\//, "");
}

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: normalizeKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? ""),
    }),
    storageBucket: storageBucketName(),
  });

const db = getFirestore(app);

async function main() {
  const filePath = process.argv[2];
  if (!filePath || filePath.startsWith("-")) {
    throw new Error(
      "Usage: npx tsx scripts/upload-book.ts <file> --title T --author A [--id UUID]",
    );
  }

  const ext = extname(filePath).slice(1).toLowerCase();
  if (!isBookExt(ext)) {
    throw new Error(`Unsupported format: .${ext}`);
  }

  const bytes = readFileSync(filePath);
  const title = argValue("--title") ?? basename(filePath, extname(filePath));
  const author = argValue("--author");
  const id = argValue("--id") ?? randomUUID();
  const storagePath = `books/${id}/original.${ext}`;

  const existing = await db.collection("books").get();
  const already = existing.docs.find((d) => d.id === id);
  if (already) {
    console.log(`Book ${id} already exists (${already.data().title}) — skipping upload.`);
    return;
  }

  const uploadedBy =
    existing.docs[0]?.data().uploadedBy ?? "seed-script";

  await getStorage(app)
    .bucket(storageBucketName())
    .file(storagePath)
    .save(bytes, {
      contentType: BOOK_MIME[ext],
      resumable: false,
      metadata: { cacheControl: "private, max-age=3600" },
    });

  const txtChapters =
    ext === "txt"
      ? detectTxtChapters(
          decodeText(
            bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer,
          ),
        )
      : undefined;

  await db
    .collection("books")
    .doc(id)
    .set({
      title,
      titleSource: "filename",
      ext,
      cover: COVERS[existing.size % COVERS.length],
      size: formatSize(bytes.length),
      sizeBytes: bytes.length,
      addedAt: new Date().toISOString(),
      uploadedBy,
      storagePath,
      ratingSum: 0,
      ratingCount: 0,
      ...(author ? { author } : {}),
      ...(ext === "txt"
        ? { txtChapters: txtChapters ?? [], txtChaptersReady: true }
        : {}),
    });

  console.log(`✓ uploaded ${id}`);
  console.log(`  ${title}${author ? ` — ${author}` : ""}  [${ext}]  ${formatSize(bytes.length)}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
