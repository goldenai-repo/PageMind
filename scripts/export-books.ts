/**
 * Dev tool: reads the shared library straight from Firestore so tip cards can
 * be authored offline. Run with:
 *   doppler run -- npx tsx scripts/export-books.ts          # list books
 *   doppler run -- npx tsx scripts/export-books.ts --text   # + extract text
 *
 * Exported text lands in scripts/exported/<id>.txt.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { decodeText } from "../src/lib/readers/decode-text";

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

const app =
  getApps()[0] ??
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL!,
      privateKey: normalizeKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? ""),
    }),
  });

const db = getFirestore(app);

async function loadBytes(bookId: string): Promise<Buffer> {
  const snap = await db
    .collection("books")
    .doc(bookId)
    .collection("chunks")
    .orderBy("index")
    .get();
  return Buffer.concat(
    snap.docs.map((d) => {
      const raw = d.data().bytes as Buffer | Uint8Array | { toUint8Array(): Uint8Array };
      if (raw instanceof Buffer) return raw;
      if (raw instanceof Uint8Array) return Buffer.from(raw);
      return Buffer.from(raw.toUint8Array()); // Firestore Bytes wrapper
    }),
  );
}

async function extractText(ext: string, bytes: Buffer): Promise<string> {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  if (ext === "txt") return decodeText(ab);
  if (ext === "pdf") {
    const mod = await import("pdfjs-dist/legacy/build/pdf.js");
    const pdfjs = ("getDocument" in mod ? mod : mod.default) as typeof import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc =
      "pdfjs-dist/legacy/build/pdf.worker.js";
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(ab),
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
    const out: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = content.items
        .map((i) => ("str" in i ? i.str : ""))
        .join(" ");
      out.push(`\n\n===== Page ${n} =====\n${text}`);
    }
    return out.join("");
  }
  if (ext === "epub") {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(ab);
    const parts: string[] = [];
    const names = Object.keys(zip.files)
      .filter((n) => /\.x?html?$/i.test(n))
      .sort();
    for (const name of names) {
      const html = await zip.files[name].async("string");
      const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
      const text = body
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
      if (text) parts.push(`\n\n===== ${name} =====\n${text}`);
    }
    return parts.join("");
  }
  return "";
}

async function main() {
  const withText = process.argv.includes("--text");
  const snap = await db.collection("books").orderBy("addedAt").get();
  console.log(`\n${snap.size} book(s) in the library:\n`);

  const outDir = join(process.cwd(), "scripts", "exported");
  if (withText) mkdirSync(outDir, { recursive: true });

  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(`  ${doc.id}  [${d.ext}]  ${d.size}  ${d.title}`);
    if (!withText) continue;
    try {
      const bytes = await loadBytes(doc.id);
      const text = await extractText(d.ext, bytes);
      const file = join(outDir, `${doc.id}.txt`);
      writeFileSync(file, `TITLE: ${d.title}\nEXT: ${d.ext}\n\n${text}`);
      console.log(`      → ${text.length} chars → ${file}`);
    } catch (err) {
      console.log(
        `      ! failed to extract: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  console.log("");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
