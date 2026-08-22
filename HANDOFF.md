# HANDOFF — PageMind Catalog Titles, URLs, Overlay Routing, TXT TOC

**Date recorded:** 2026-08-22  
**Branch:** `feat/smart-notes` (cut from `main` after PR #11 merge, `2ec0fe0`)  
**HEAD at handoff:** `c367036` — `Fix my library book URL ID`  
**Working tree at handoff:** clean except this file (write it, then commit if the user asks)  
**This conversation:** [Catalog title and URLs](6e48a7cf-43e5-4181-aa88-728f59d54cf7)  
**Earlier related chats:**
- [Book summary API / overlay](4fa87fb7-bb59-4ea0-bda8-5f928c8864df)
- [Book detail overlay prototype](7e860d60-78b0-4aa3-85a0-d08c08f10c00)
- Older storage handoff lived in this file (2026-08-10, `feat/book-storage`) — **shipped** as [PR #10](https://github.com/goldenai-repo/PageMind/pull/10). Do not resume that work.
- `HANDOFF-COCO.md` (2026-08-21) still describes **Smart Notes** as the next product task. This conversation did **not** build Smart Notes.

This note is for a **new conversation with no access to the previous context window**. Trust `git log` + the code if anything here disagrees.

---

## 1. What task were we working on?

User opened the reader and overlay and asked four things, then two product corrections:

1. **Display titles** — were we using the PDF/EPUB/TXT **filename** or real book metadata? **Must use the real book title. Never show the filename.**
2. **Google Books matching** — why *The Great Gatsby* failed; show **author** on the book overlay.
3. **URLs** — Home overlay showed `/library/{uuid}`; My Books / Favorite / etc. stayed on `/library?shelf=mine` with **no id**. User wanted the book **ID in the URL**.
4. **TXT chapters** — KMP chapter detection existed but ran **every open**. Persist the chapter map in Firestore.

Then the user locked routing:

- **Overlay = Home (bookstore) only.**
- **My Books / Favorite / Want to Read / Finished** → click starts **reading**, no overlay.

---

## 2. What is done (current state)

All of the above is implemented and committed on `feat/smart-notes` as `c367036`. **Not pushed** unless the user did it separately. **No PR yet.** Ask before commit/push of this `HANDOFF.md`.

### 2a. Overlay vs reader (locked)

| Surface | Click a cover | URL while book is open |
|---------|----------------|------------------------|
| **Home** | Overlay at `/library/{bookId}` | Same; Read keeps the URL; close reader → overlay still there; close overlay → `/library` |
| **My Books / Favorite / Want / Finished** | **Reader immediately** (no overlay) | `/library/{bookId}?shelf=mine` (or `favorite` / `want` / `finished`); close reader → `/library?shelf=…` |

Code: `src/components/library-section.tsx`

- `showDetail = isHome && selectedBookId && !currentBook` — overlay **only** on Home.
- `onOpen`: Home → `openDetail`; other shelves → `openFromShelf` (push ID URL, then `openBook`).
- `closeReader`: on personal shelves, `router.push(libraryPath(null, shelf))` so the ID does not linger.

Helpers: `src/lib/library-path.ts`

```
/library                         Home grid
/library?shelf=mine              My Books grid
/library/{bookId}                Home overlay (or Home reader on top)
/library/{bookId}?shelf=mine     My Books reader
```

**Do not** restore the old `useEffect` that `router.replace`’d personal-shelf URLs back to `?shelf=mine` whenever an id was present. That is why My Books never showed an id.

**Do not** open the overlay from My Books / Favorite / Want / Finished. That was tried in this conversation; the user rejected it.

**Do not** add `/library/{id}/reviews` as a standalone page. Tried in PR #11 era; user rejected it. Reviews stay inside the overlay panel.

### 2b. Book titles — never the filename

Previously `POST /api/books` stored `file.name` minus extension (`sabatini-chivalry`, `various-king-james-bible`). That is what the reader chrome and cards showed.

Now, catalog `books/{id}.title` comes from, in order:

1. **EPUB** OPF `dc:title` (`titleSource: "metadata"`).
2. **PDF** Info `/Title` only if it looks like a real name (`titleSource: "metadata"`). Reject Word dumps: `Untitled`, `Microsoft Word - document.docx`, paths, `*.pdf`.
3. **Google Books** matched volume title (`titleSource: "google-books"`) — used when file metadata is missing (typical PDF/TXT, and EPUB with no `dc:title`).
4. Filename is only a **search hint**, stored as `titleSource: "filename"` if Google also fails.

Key files:

- `src/lib/book-metadata.ts` — `extractBookIdentity`, `extractPdfTitle`, `isUsablePdfTitle`, `looksLikeFileStemTitle`, `needsCatalogTitleLookup`, `humanizeFileTitle`.
- Upload: `src/app/api/books/route.ts` — identity extract + Google lookup in the same POST.
- Backfill: `GET /api/books/[id]/summary` updates Firestore title/author/`titleSource`.
- Client: `enrichCatalogTitles` in `src/lib/library-api.ts`, called from `LibrarySection` after the grid paints (same pattern as cover enrich). Opening a book also fetches summary if `needsCatalogTitleLookup`.

`BookDoc.titleSource`: `"metadata" | "google-books" | "filename"`. Exposed on `BookMeta`.

**Existing books** in Firestore still have slug titles until the next `/summary` (Home overlay, library load enrich, or open-to-read). After that, title is persisted. First Home visit after this change may fire one summary request per unresolved book — then `titleSource` stops the loop.

Overlay also shows **author** under the title (`book.author`, filled from OPF `/Author` / Google). Summary JSON includes `{ title, author }` so the header can update before a catalog reload.

### 2c. Google Books matching (why Gatsby failed)

Matcher: `src/lib/google-books.ts`. Overlay summary: `GET /api/books/[id]/summary`.

**Root cause of “no summary for Great Gatsby”:** we queried `intitle:"the-great-gatsby"` (raw filename). Google Books does not treat that as *The Great Gatsby*. A 7-day **negative cache** (`googleSummary.text: null`) then froze the miss.

Fixes:

- `titleForSearch` / `buildSearchQueries` replace hyphens with spaces, then `intitle:"the great gatsby"`, plus an unquoted fallback.
- `GOOGLE_SUMMARY_MATCHER_VERSION = 2` — old negative caches retry; successful caches with a slug title and no `cache.title` also retry.
- `maxResults` 20. Matched volume **title + authors** stored on the cache.
- If the file had no author, save Google’s author onto `BookDoc.author`.

Env: `GOOGLE_BOOKS_API_KEY` via **Doppler** (`npm run dev` → `doppler run -- next dev`). GCP project **GoldenAI-PageMind**. Without the key, lookup fails and titles fall back to file metadata only.

### 2d. TXT chapter TOC — stored, not re-scanned every open

Algorithm (already existed): KMP in `src/lib/readers/txt-chapters.ts`. Markers: `Chapter N`, `第X章/回/篇…`, `楔子` / `序章`, markdown `#` / `##` / `###`. Duplicate labels (front 目录 vs body) keep the **later** hit. **Never** invent equal-size “Part N” fake chapters.

**Now persisted** on `books/{id}`:

- `txtChapters: { start: number; label: string }[]`
- `txtChaptersReady: boolean` (so `[]` means “detected, none found”, not “not computed”)

Written at TXT upload (`POST /api/books`) and backfilled on `GET /api/books/[id]/file` if missing. Catalog list includes `txtChapters` when ready. `mountTxtReader({ chapters })` **skips KMP** when `chapters` is passed (including `[]`).

Rendering still splits large chapters into layout sections for performance — that is **not** the TOC.

### 2e. What we did **not** do (still open product work)

**Smart Notes** (original reason for `feat/smart-notes`, see `HANDOFF-COCO.md`):

- Panel exists; Firestore `books/{id}/tips` is read-only.
- Most books: “No smart notes for this book yet.”
- No generate API, no seed pipeline, no click-to-highlight.
- `docs/tip-cards.md` is stale (still talks IndexedDB + user-authored tips).

Ask the user before building Smart Notes (seed vs AI vs manual).

---

## 3. Tech stack (this repo)

| Layer | Choice |
|-------|--------|
| App | Next.js **16.x** — breaking vs training data. Read `AGENTS.md` + `node_modules/next/dist/docs/`. Route `params` is a `Promise`. |
| UI | React client, Tailwind v4, shadcn + Base UI (`Button` is `@base-ui/react/button`; `render={<Link />}` needs `nativeButton={false}`) |
| Auth / data | Firebase Auth + Admin Firestore + Cloud Storage. Project **`goldenai-pagemind`**. Secrets via **Doppler**, not committed `.env.local`. |
| Catalog | Firestore `books/{id}` |
| Files | Storage `books/{bookId}/original.{ext}` (legacy: Firestore chunks) |
| Personal shelf | `users/{uid}/books/{bookId}` |
| Google synopsis | `books/{id}.googleSummary` |
| Reader | TXT/EPUB `createFlowReader`; PDF pdf.js; spread = StPageFlip only for `spread` |
| Tests | Vitest. Node tests for google-books / book-metadata / library-path are green. **jsdom reader tests** can fail on Node 20 (`ERR_REQUIRE_ESM` from `html-encoding-sniffer` / `@exodus/bytes`) — pre-existing; do not rewrite the Vitest config unless asked. |

**Key files for this work**

```
src/lib/book-metadata.ts
src/lib/google-books.ts
src/lib/library-path.ts
src/lib/library-server.ts          # BookDoc.titleSource, txtChapters, googleSummary
src/lib/library-api.ts             # enrichCatalogTitles, openLibraryBook summary merge
src/lib/readers/txt-chapters.ts    # KMP detector
src/lib/readers/txt.ts             # mountTxtReader({ chapters })
src/app/api/books/route.ts         # upload identity + Google + TXT TOC
src/app/api/books/[id]/summary/route.ts
src/app/api/books/[id]/file/route.ts  # TXT TOC backfill
src/components/library-section.tsx
src/components/book-detail-overlay.tsx
src/components/book-reader.tsx
```

**Console map**

- Storage → files under `books/{bookId}/…`
- Firestore catalog → title, author, titleSource, googleSummary, txtChapters
- Personal state / ratings / tips → not in Storage

---

## 4. Challenges / where we spent time

1. **Filename vs metadata** — Gutenberg/Standard Ebooks files are slugs. EPUB usually has `dc:title`; PDF `/Title` is often garbage; TXT has no metadata. Google Books is the real title source for PDF/TXT.
2. **Gatsby miss** — not a missing API key in the “happy path”; it was `intitle:"slug-with-hyphens"` + negative cache. Easy to misdiagnose as “Google doesn’t have Gatsby.”
3. **URL vs overlay** — Home used `/library/{id}`; personal shelves skipped the overlay and a `useEffect` **stripped the id**. First fix opened the overlay on every shelf so the URL could hold an id. User then said overlay is Home-only; personal shelves must jump to the reader. Final design: ID in the URL **while reading** on those shelves; overlay still Home-only.
4. **Title backfill vs API quota** — cannot Google every book on every `GET /api/books`. Enrich after paint; persist `titleSource` so we do not loop. Filename-source + slug-looking titles still retry; `google-books` / `metadata` do not.
5. **React Compiler lint** on the overlay — `setState` in `useEffect` for panel reset and summary loading. Worked around with keyed panel state (`reviewsForId`) and `key={book.id}` on `BookSummaryBody` so the fetch effect does not sync-set idle/loading.
6. **Vitest jsdom** — TXT reader tests that need the DOM may not start. Prefer Node-environment tests for metadata/Google/path. Do not “fix” the whole Vitest stack in passing.

---

## 5. Mistakes to avoid next time

1. **Do not show the book overlay on My Books / Favorite / Want / Finished.** Home only. Personal shelves start the reader.
2. **Do not display the filename (or a hyphenated slug) as the book title.** EPUB `dc:title`, usable PDF `/Title`, or Google Books title. Filename is a search hint only.
3. **Do not search Google Books with `intitle:"file-name-slug"`.** Hyphens → spaces (`titleForSearch`) or you will miss *The Great Gatsby* and similar.
4. **Do not strip `/library/{bookId}` on personal shelves** with a `useEffect` that `replace`s to `?shelf=mine` whenever an id is present. That killed shareable/readable URLs. Clear the id **on reader close**, not on mount.
5. **Do not open overlay from all shelves “just to get an id in the URL.”** Put the id on the reader URL instead.
6. **Do not invent TXT Contents from equal-size byte chunks / “Part N”.** KMP headings or empty TOC. Persist `txtChapters`; do not re-KMP every open when the map is stored.
7. **Do not add `/library/{id}/reviews` as a page.** Overlay panel only.
8. **Do not remount the reader on every progress field change** — key on `book.id`.
9. **Do not flash generated title-covers** for EPUB/PDF before the real cover.
10. **Do not put `gs://` in `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`.**
11. **Do not treat My Books Delete as catalog delete** — soft-remove; keep rating.
12. **Do not invent Next.js APIs from training data** — this tree is Next 16.
13. **Ask before commit/push.**
14. **Do not commit `.env.local` / service account keys.**

---

## 6. Known gaps / not done

- [ ] **Commit/push this `HANDOFF.md`** if the user wants it on the branch; then **PR `feat/smart-notes`** when they ask (currently 1 commit ahead of `main`: `c367036`).
- [ ] Smoke: Home overlay still works; My Books click skips overlay and reads; URL has id while reading; close returns to `?shelf=mine`.
- [ ] Smoke: slug-named books (`sabatini-chivalry`, `various-king-james-bible`, Gatsby) show **real titles** after one library load / open; overlay shows **author**.
- [ ] Smoke: TXT Contents come from stored chapters, not a rescan (and not fake Part N).
- [ ] Existing Firestore rows: title backfill is lazy. If enrich/`/summary` fails (no API key, quota), cards stay on the old slug until a later success.
- [ ] `needsCatalogTitleLookup`: after a failed Google lookup we set `titleSource: "filename"`. Humanized titles with spaces then **stop** retrying. A later quota recovery will not auto-fix those until matcher/source is bumped or the user re-uploads.
- [ ] Smart Notes (see `HANDOFF-COCO.md` §0) — not started in this conversation.
- [ ] PDF outline/bookmarks as real TOC (today: outline when present; otherwise pages).
- [ ] Cover images still client-extract + IndexedDB, not Storage.
- [ ] Legacy chunk-backed books → Storage migration; deploy `firestore.rules` / `storage.rules`.
- [ ] jsdom Vitest `ERR_REQUIRE_ESM` on Node 20.

---

## 7. Suggested next steps

1. User smoke-test titles + Home overlay vs My Books reader + URLs (list in §6).
2. If titles still show slugs: check Doppler `GOOGLE_BOOKS_API_KEY`, Network tab `GET /api/books/{id}/summary`, Firestore `books/{id}.title` / `titleSource` / `googleSummary`.
3. When the user is done with this catalog polish: either PR `feat/smart-notes` as-is, or start Smart Notes (ask seed vs AI vs manual first).
4. Do not mix a Smart Notes implementation into a titles/URL PR unless they ask.

---

## 8. User preferences observed

- Concise answers; English is fine.
- **Overlay is a bookstore (Home) feature**, not a library-shelf feature.
- **Always show the real book title**, never the file name.
- Book permalink should include the **catalog UUID**.
- TXT chapters must be **detected once and stored**, never fake Part N.
- Ask before commit/push.
- Strong older opinions still in force: ratings survive soft-delete; Home shows shared average; covers should not flash; no `/library/{id}/reviews` page.

---

*End of handoff. If the working tree disagrees, trust `git log` + code and update this file.*
