/**
 * Seeds the pre-authored tip cards from src/data/book-tips.json into Firestore
 * (books/{id}/tips/{index}), which the app reads at runtime. Re-runnable: it
 * replaces the existing tips for each book. Run with:
 *   doppler run -- npx tsx scripts/seed-tips.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

type AuthoredTip = {
  type: string;
  title: string;
  body: string;
  anchorText: string;
  chapterHref?: string;
  pageNumber?: number;
  references?: { label: string; url: string }[];
};

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

async function main() {
  const file = join(process.cwd(), "src", "data", "book-tips.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as Record<
    string,
    AuthoredTip[]
  >;

  for (const [bookId, tips] of Object.entries(data)) {
    const bookRef = db.collection("books").doc(bookId);
    if (!(await bookRef.get()).exists) {
      console.log(`  ! ${bookId} not in library — skipping`);
      continue;
    }

    const tipsRef = bookRef.collection("tips");
    // Clear existing tips so re-seeding replaces rather than duplicates.
    const existing = await tipsRef.get();
    await Promise.all(existing.docs.map((d) => d.ref.delete()));

    await Promise.all(
      tips.map((tip, order) => {
        const doc: Record<string, unknown> = {
          type: tip.type,
          title: tip.title,
          body: tip.body,
          anchorText: tip.anchorText,
          references: tip.references ?? [],
          order,
        };
        if (tip.chapterHref !== undefined) doc.chapterHref = tip.chapterHref;
        if (tip.pageNumber !== undefined) doc.pageNumber = tip.pageNumber;
        return tipsRef.doc(String(order)).set(doc);
      }),
    );
    console.log(`  ✓ ${bookId} — seeded ${tips.length} tips`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
