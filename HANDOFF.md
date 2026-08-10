# HANDOFF — PageMind Book Storage + Library Cloud Sync

**Date recorded:** 2026-08-10  
**Branch:** `feat/book-storage` (cut from latest `main` after PR #9 / user-library merge)  
**Working tree at handoff:** mostly committed; check `git status` — may still have uncommitted TOC/TXT reader fixes (`epub-engine`, `flow-reader`, `txt`, `book-reader`, `txt.test.ts`)  
**Design doc:** `docs/bookshelf-design.md` (v1.3)  
**Firebase project:** `goldenai-pagemind` (Blaze + free trial; Storage bucket `goldenai-pagemind.firebasestorage.app`)

This note is for a **new conversation with no prior context**. Read this + `docs/bookshelf-design.md` before changing storage, ratings, covers, or reader TOC.

---

## 1. What task were we working on?

**Phase 2 book storage / cloud bookshelf** on `feat/book-storage`:

1. Move catalog file bytes to **Firebase Cloud Storage** (keep Firestore chunk fallback for old books).
2. Personal shelf state in Firestore: My Books, favorite, want/finished, progress, **personal rating**.
3. **Home community average rating** (decimal + partial stars + numeric label).
4. Wire `/library` + Upload UI to cloud APIs (IndexedDB = cache only).
5. Covers without flash (title art → real EPUB/PDF cover).
6. Persist **reader mode** (single / scroll / spread) **per user**.
7. Double-page: same tap left/right page-turn as single page.
8. Fix TOC chapter highlight for EPUB; **stop inventing fake TXT “Part N” chapters**.
9. Research (only) how to detect real chapters in TXT later.

**Product vision (locked earlier):** Home = shared catalog; My Library = personal; soft-delete from My Books does not remove the book from Home.

---

## 2. What is done (current state)

### Commits on this branch (approx.)

| Commit (short) | Topic |
|----------------|--------|
| `a38927f` | Storage for books + rating plumbing |
| `ab8e669` | Cover rendering / flash fix |
| `cae6fa9` | Double-page click-to-flip |
| `c4baf9a` | Rating survives delete / no double-count |
| (+ possibly more local edits) | EPUB TOC nearest-chapter highlight; TXT no fake TOC |

Confirm with `git log --oneline main..HEAD`.

### Storage / catalog

- **New uploads:** `POST /api/books` → Cloud Storage `books/{bookId}/original.{ext}` + Firestore `books/{bookId}` with `storagePath`.
- **Old books:** still load via `books/{id}/chunks/*` when `storagePath` missing (`loadBookFile` dual path).
- **Delete upload (temp admin):** `DELETE /api/books/[id]` removes Storage object + Firestore book (+ chunks/tips).
- Env: `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=goldenai-pagemind.firebasestorage.app` (**no `gs://` prefix**).

### Personal state (`users/{uid}/books/{bookId}`)

Fields include: `inMyLibrary`, `favorite`, `status` (`want` \| `finished`), `rating` (0–5), progress / `locator`, `lastOpenedAt`, etc.

- Soft-delete (`DELETE /api/shelf/[bookId]` or `inMyLibrary: false`): clears membership/favorite/status **but keeps `rating` (and progress)**.
- Re-add restores personal stars.
- Legacy thin docs under `shelves/{uid}/books` still read as fallback (`listUserBookEntries`).

### Community ratings (Home)

- Per-user vote source of truth: `books/{bookId}/ratings/{uid}` `{ rating, updatedAt }`.
- Denormalized on catalog: `ratingSum`, `ratingCount` → average = sum/count (1 decimal).
- `setCatalogUserRating` recomputes aggregates from the `ratings` subcollection (avoids double-count after soft-delete).
- **UI:** Home / Upload show **average** + number (`4.0`); My Library shows **personal** interactive stars + number.
- Star component supports **partial fills** for decimals (`src/components/star-rating.tsx`).

### Covers

- EPUB: embedded cover when present; else title gradient.
- PDF: page-1 raster; else title gradient.
- TXT: title gradient only (color from title hash).
- **EPUB/PDF:** do **not** flash title art first — plain placeholder until real/fallback cover; cache final blob in IndexedDB `pagemind` / store `covers` (DB_VERSION 3).
- `fetchLibraryBooks` → `attachCachedCovers` for fast refresh.

### Reader mode prefs

- Local: `localStorage` key `pagemind:reader-mode` (+ per-user `pagemind:reader-mode:{uid}`).
- Cloud: Firestore `users/{uid}.readerMode` via `GET/PATCH /api/user/prefs`.
- Modes: `flip` (single + tap nav), `scroll`, `spread` (two-page; tap left/right same as single; StPageFlip `disableFlipByClick: true`).

### TOC / Contents sidebar

- **EPUB:** real nav/NCX → resolved to spine; active highlight uses exact section match **or nearest previous** TOC row (fixes books where spine ≠ TOC 1:1).
- **TXT:** **no Contents sidebar** (size-based sections remain for performance only — not chapters).
- **PDF:** synthetic `Page N` list (not real PDF outline/bookmarks yet).
- Right panel is **Smart Notes**, not TOC — no chapter highlight there by design.

### Research done (not implemented): TXT real chapters

See §8. Heuristics (EN `Chapter N` / ZH `第X章`) or Markdown `##` markers; hybrid recommended. Do **not** bring back equal-size “Part N” as TOC.

---

## 3. Tech stack (relevant)

| Layer | Choice |
|-------|--------|
| App | Next.js (repo-specific — read `AGENTS.md` / `node_modules/next/dist/docs/` before inventing APIs) |
| UI | React client, Tailwind, existing PageMind chrome |
| Auth | Firebase Auth + Admin session cookies |
| Catalog metadata | Cloud Firestore `books/{id}` |
| File bytes | Firebase Storage (new) / Firestore chunks (legacy) |
| Personal state | Firestore `users/{uid}/books/{bookId}` |
| Ratings aggregate | `books/{id}/ratings/{uid}` + `ratingSum`/`ratingCount` |
| Browser cache | IndexedDB `pagemind` (file bytes + covers + tips); legacy per-user IDB still exists but UI should not treat it as source of truth |
| Readers | `flow-reader` (TXT/EPUB), `pdf.ts`, `flip-book` (spread only) |

### Key files

```
src/lib/library-server.ts      # Admin Firestore/Storage, ratings, prefs, dual load
src/lib/library-api.ts         # Client fetch/upload/shelf/covers/prefs
src/lib/firebase/admin.ts      # Admin app + getAdminBucket()
src/lib/storage.ts             # IndexedDB cache (books/tips/covers), DB_VERSION 3
src/lib/cover.ts               # extractCoverImage / generateTitleCover
src/lib/books.ts               # types, averageRating, removeFromMyLibrary
src/app/api/books/route.ts
src/app/api/books/[id]/route.ts
src/app/api/books/[id]/file/route.ts
src/app/api/shelf/route.ts
src/app/api/shelf/[bookId]/route.ts
src/app/api/user/prefs/route.ts
src/components/library-section.tsx
src/components/upload-section.tsx
src/components/book-card.tsx
src/components/star-rating.tsx
src/components/book-reader.tsx
src/lib/readers/flow-reader.ts
src/lib/readers/epub-engine.ts
src/lib/readers/txt.ts
src/lib/readers/flip-book.ts
src/lib/readers/reader-mode.ts
docs/bookshelf-design.md
```

**Console map for humans:**
- **Storage** → only files under `books/{bookId}/…`
- **Firestore** → catalog, `users/…/books`, ratings, tips, prefs on `users/{uid}`

---

## 4. Challenges / where we got stuck or spent time

1. **Spark → Blaze / $300 credit** — PageMind project was under “No organization”; free-trial billing was on another GCP project (`My First Project`). Fix: link the trial billing account to `goldenai-pagemind`, then Storage Get started. Firebase plan modal does **not** show “$300”.
2. **Duplicate env bucket** — `.env.local` briefly had `gs://…` which breaks the web SDK; keep bare bucket id only.
3. **Cover flash** — showing generated title cover then swapping to EPUB/PDF cover on every refresh; fixed with placeholder + IDB cover cache.
4. **Rating soft-delete bug** — Home average kept old vote while My Library showed 0 after re-add → re-rate double-counted (2 then 4 → avg 3). Fixed by persisting personal rating + `ratings/{uid}` recompute.
5. **EPUB TOC highlight missing** — `tocActive` required exact spine↔TOC match; many books fail. Fixed with nearest-previous chapter.
6. **TXT fake TOC** — user rejected size-split “Part N” as chapters; removed Contents for TXT.
7. **Vitest** — may still fail to start (`std-env` ESM / `vi` in setup); prefer eslint on touched files; don’t trust `tsc` alone for green CI without checking known test setup noise.

---

## 5. Mistakes / pitfalls to avoid next time

1. **Do not** show personal progress on **Home**.
2. **Do not** remount the reader on every progress field change — key on `book.id` only.
3. **Do not** treat My Books Delete as catalog delete — soft-remove only; **keep rating**.
4. **Do not** invent TXT Contents from byte chunks.
5. **Do not** put `gs://` in `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.
6. **Do not** look for favorites/ratings in Storage — they are Firestore-only.
7. **Do not** use delta-only rating aggregates without a per-uid ratings doc — soft-delete/re-add will corrupt averages.
8. **Do not** flash title-cover for EPUB/PDF before the real cover is ready.
9. **Do not** invent Next.js APIs from training data — follow this repo’s Next + `AGENTS.md`.
10. **Do not** commit `.env.local` / service account keys.
11. Ask before committing/pushing unless the user requests it.

---

## 6. Known gaps / not done

- [ ] Commit/push any remaining TOC/TXT uncommitted files; open PR for `feat/book-storage` if not already.
- [ ] Migrate legacy **chunk** books → Storage (`storagePath`).
- [ ] Deploy **`firestore.rules` / `storage.rules`** (Admin SDK bypasses rules; still needed for client safety / prod).
- [ ] Backfill / one-time repair of broken `ratingSum`/`ratingCount` for books rated before `ratings/{uid}` existed (re-rate once often fixes).
- [ ] Optional: store cover images in Storage (today: client extract + IDB only).
- [ ] TXT **real** chapter detection (heuristics ZH/EN or Markdown) — researched, not implemented.
- [ ] PDF outline/bookmarks as real TOC (today: Page 1…N).
- [ ] Home “average” when `ratingCount === 0` already shows `0.0` — confirm UX is desired.
- [ ] Remove temp Upload “Delete upload” when no longer needed for testing.
- [ ] Update/replace stale committed `HANDOFF-COCO.md` (older reader-only handoff); this `HANDOFF.md` is the current storage handoff.
- [ ] Security: App Check banner in console — optional.

---

## 7. Suggested next steps

1. `git status` — finish commit of leftover reader/TOC files if dirty.
2. Smoke test: upload → Storage object; rate → `users/…/books` + `books/…/ratings/{uid}`; soft-delete → re-add → stars restored; Home avg updates 2→4 correctly; EPUB Contents highlight; TXT has **no** Contents.
3. Implement TXT chapter detector (ZH `第X章` + EN `Chapter`) with sanity bounds; empty TOC if detection fails.
4. Chunk→Storage migration script + rules files.
5. PR to `main` when smoke tests pass.

---

## 8. TXT chapter research (summary for implementers)

Plain TXT has no native TOC. Options:

1. **Heuristics:** line looks like a heading (EN Chapter/Part; ZH 第X章/回/篇; ALL CAPS; blank-line gated; reject dialogue/mid-sentence). See Readest, plaintxt-epub, Calibre discussions.
2. **Explicit markers:** Markdown `## Title` (most reliable; Calibre’s preferred TXT path).
3. **Hybrid (recommended):** try heuristics → if chapter count sane, show Contents; else no sidebar (current). Never use equal-size parts as chapters.

Rendering may still split large TXT into sections for performance — keep that separate from TOC.

---

## 9. User preferences observed

- Concise answers; bilingual OK when explaining product/setup.
- Design docs English; chat can be EN/中文.
- Ask before commit/push.
- Strong opinions: no fake TXT chapters; ratings survive soft-delete; Home shows shared average with number + partial stars; covers shouldn’t flash.

---

*End of handoff. If the working tree disagrees, trust `git log` + code and update this file.*
