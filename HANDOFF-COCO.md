# HANDOFF — PageMind (Coco)

**Date recorded:** 2026-08-21  
**New branch (start here):** `feat/smart-notes` (cut from latest `main` after PR #11 merge, `2ec0fe0`)  
**Previous branch:** `feat/book-detail-overlay` — **merged** to `main` as [PR #11](https://github.com/goldenai-repo/PageMind/pull/11)  
**Working tree at handoff:** clean except this file (uncommitted on purpose — commit it if you want it on the branch)  
**This conversation (no other window access):** [Book summary API research](4fa87fb7-bb59-4ea0-bda8-5f928c8864df)  
**Related earlier chat:** [Book detail overlay](7e860d60-78b0-4aa3-85a0-d08c08f10c00) (2026-08-19, overlay prototype / TOC+notes chrome)

This note is for a **new conversation with no access to the previous context window**. Read this first. Do not assume the overlay/reviews/reader work still needs to be built — it shipped in PR #11. The live task is **Smart Notes**.

---

## 0. What to work on now

**Task: Smart Notes (tip cards in the reader).**

Product intent (from `docs/tip-cards.md`): reader-anchored annotations that sit in a right-hand panel and never interrupt reading. Types: background, controversy, deep-dive, connection, fact-check.

**What already exists (do not rebuild):**

- Right-hand **Smart Notes** panel in the reader (`src/components/reader-notes-sidebar.tsx`), toggled by the header lightbulb.
- Load tips: `GET /api/tips/[bookId]` → Firestore `books/{bookId}/tips` ordered by `order`.
- Client: `fetchTipsForBook` in `src/lib/library-api.ts`.
- Visibility: only tips whose `anchor.text` (whitespace-stripped) is a substring of the current page text from `rendition.getContext()`. See `book-reader.tsx`.
- Types/colors: `src/lib/tips.ts` (`TIP_TYPES`).
- Firestore shape: `TipDoc` in `src/lib/library-server.ts`.

**What is NOT done (this is the gap):**

- `docs/tip-cards.md` is **stale**. It still describes IndexedDB + user-authored tips + `POST /api/tips/generate` (Claude). The app now uses **Firestore catalog tips**, read-only, no generate API, no “Add tip” popover, no click-card-to-highlight-passage.
- Most books show **“No smart notes for this book yet.”** There is no seed pipeline and no AI generation.
- Clicking a card does **not** scroll/highlight the anchor in the page.
- No per-page “Generate tips” button.

**Ask the user before building** whether they want:

1. Pre-authored / admin-seeded tips in Firestore (current schema), and/or
2. On-demand AI generation from the current page (`getContext().text` + title/author), and/or
3. Manual “Add tip” from selected text.

MVP in the design doc was: schema → panel (done) → manual create → AI generate. Panel is done; the rest is the new work.

---

## 1. What we just finished (2026-08-21) — do not redo

Shipped on `feat/book-detail-overlay` → **PR #11 merged to main**.

### Commits

| Commit    | Message |
|-----------|---------|
| `d2125b4` | Book detail overlay window prototype |
| `b3d5b6f` | Fix sidebar (TOC in app sidebar, notes on the right) |
| `a2c78ee` | Google Books API + summary in overlay |
| `774f397` | Fix reading panel centering, page flip, mode switcher |
| `2ec0fe0` | Merge PR #11 into `main` |

### 1a. Book detail overlay

- Home cards open `/library/{bookId}` as an overlay (`src/components/book-detail-overlay.tsx`), not a full page.
- Overlay lives in `Dialog`; navy header + white body; `max-w-3xl`, `max-h-[min(82vh,760px)]`.
- **Same overlay, two panels:** `panel: "book" | "reviews"`. Customer Reviews chevron / **More** switches to reviews; circular back (ChevronLeft) returns to book details. **Do not add `/library/{id}/reviews` as a page again** — that was tried and the user rejected it. A reviews page was deleted.
- `src/app/library/layout.tsx` + `library-workspace.tsx` + `library/[bookId]/page.tsx` keep the shelf underneath and open the overlay from the URL.

### 1b. Google Books synopsis

- Empty Summary loads via **title + author**.
- Server: `GET /api/books/[id]/summary` (`src/app/api/books/[id]/summary/route.ts`).
- Client matcher: `src/lib/google-books.ts` (`intitle:` / `inauthor:` waterfall, HTML→text, title/author scoring, `pickBestVolume`).
- Author extract on upload: `src/lib/book-metadata.ts` (EPUB OPF `dc:creator`, PDF `/Author`). Stored on `BookDoc.author` when possible.
- Cache: Firestore `books/{id}.googleSummary`.
- Overlay shows “From Google Books”.
- Env: `GOOGLE_BOOKS_API_KEY` in `.env.example`. App uses **Doppler** (`npm run dev` → `doppler run -- next dev`). GCP project **GoldenAI-PageMind**; enable Books API; restrict key; `doppler secrets set GOOGLE_BOOKS_API_KEY="..."`. Without the key, summary lookup fails.

### 1c. Customer reviews

- Personal review fields on `users/{uid}/books/{bookId}`: `reviewTitle`, `reviewBody`, `rating` (Rate and Review dialog: `src/components/rate-review-dialog.tsx`).
- **Public copies** (written reviews only — title or body, not star-only) synced to `books/{bookId}/reviews/{uid}` via `syncPublicReview` on shelf `PATCH` (`src/lib/library-server.ts`).
- Star-only ratings still feed average/distribution from `books/{id}/ratings`.
- APIs:
  - `GET /api/books/[id]/reviews`
  - `POST /api/books/[id]/reviews/[reviewId]/vote` body `{ vote: "up" | "down" }` (toggle; cannot vote on own).
- Types/sort: `src/lib/reviews.ts`. Tests: `src/__tests__/lib/reviews.test.ts`.
- UI: `book-review-card.tsx`, `book-reviews-preview.tsx`, `book-reviews-view.tsx`.
- Overlay preview: heading **Customer Reviews** + chevron, highest-rated cards, truncated body + **More**.
- **No “Report a Concern”** — user asked it removed. Do not add a report route/button back.
- Histogram: Lucide `Star` × N per row in a **fixed-width left gutter** so bars line up (not a descending staircase of 5,4,3,2,1 stars).
- First GET backfills **current user’s** old shelf review into the public collection; **other users’ old written reviews appear only after they save again**.

**Most helpful sort (locked):** not Amazon Wilson score.

1. Net score = `helpfulCount - notHelpfulCount`
2. Raw helpful count
3. Star rating
4. Newest

Votes persist on the review doc: `votes: Record<uid, "up" | "down">`.

### 1d. Reader layout fix (same day, last)

Symptoms: page stuck on the left with a gray gutter; no Previous/Next; mode switcher missing in the header.

**Root cause:** Smart Notes used a **nested shadcn `Sidebar` + `SidebarProvider`**. That sidebar is `position: fixed; inset-y-0; right: 0` (viewport), so it:

- Covered the reader header (mode switcher + font size) — user saw the notes navy lightbulb overlapping the toolbar.
- Default `w-full` / `min-h-svh` on the nested wrapper stole flex space → white page looked left-aligned.
- Stretched the reader taller than the viewport → footer Previous/Next clipped; paginator had no definite height → one “page”, cannot flip.

**Fix (keep this):**

- Notes are an **in-flow `<aside>`**, not `Sidebar side="right"`. See comment in `reader-notes-sidebar.tsx`.
- No nested `SidebarProvider` in `book-reader.tsx`.
- When reading, app `SidebarProvider` gets `h-svh overflow-hidden` (`app-shell.tsx`) so the page card has a real height and pagination works.
- Page card: `flex: 1`, `width/height 100%`, text column still `.pm-page-viewport--single { max-width: 44rem; margin: 0 auto }`.
- Header order: **mode switcher → A− / size / A+ → lightbulb**. Modes only for reflowable TXT/EPUB.

---

## 2. Tech stack (this repo, not training-data Next.js)

- **App:** Next.js **16.x** (this tree has breaking changes). **Read `node_modules/next/dist/docs/` and `AGENTS.md` before writing routes.** `params` is a `Promise` in app routes (`{ params }: { params: Promise<{ id: string }> }`).
- **UI:** React client components, Tailwind v4, **shadcn + Base UI** (`Button` is `@base-ui/react/button`). `render={<Link />}` on a Button requires **`nativeButton={false}`** or you get a runtime overlay error.
- **Auth / data:** Firebase Auth + Admin Firestore + Cloud Storage. Project **`goldenai-pagemind`**. Secrets via **Doppler**, not committed `.env.local`.
- **Reader:** custom TXT/EPUB `createFlowReader` (`src/lib/readers/flow-reader.ts`); PDF via pdf.js; spread mode uses `page-flip` (StPageFlip) **only for `spread`**, not default `flip`.
- **Tests:** Vitest. `src/__tests__/lib/reviews.test.ts` is Node (no jsdom). jsdom reader tests can fail on Node 20 with `ERR_REQUIRE_ESM` (`html-encoding-sniffer` / `@exodus/bytes`) — pre-existing; don’t “fix” by rewriting the whole Vitest config unless asked.
- **Dev:** `npm run dev` → Doppler-wrapped `next dev`.

### Key files for Smart Notes (next)

```
docs/tip-cards.md                      # Design — STALE vs Firestore; update when you implement
src/lib/tips.ts                        # TipCard, TIP_TYPES
src/lib/library-server.ts              # TipDoc, tipsCollection(bookId)
src/app/api/tips/[bookId]/route.ts     # GET only
src/lib/library-api.ts                 # fetchTipsForBook
src/components/book-reader.tsx         # load tips, filter visibleTips, lightbulb toggle
src/components/reader-notes-sidebar.tsx  # in-flow aside — do not convert back to shadcn Sidebar
src/lib/readers/types.ts               # getContext() for current page text
src/lib/readers/flow-reader.ts         # getContext implementation (TXT/EPUB)
src/lib/readers/pdf.ts                 # getContext for PDF
```

### Key files for overlay/reviews (already shipped)

```
src/components/book-detail-overlay.tsx
src/components/book-reviews-view.tsx
src/components/book-reviews-preview.tsx
src/components/book-review-card.tsx
src/lib/reviews.ts
src/lib/google-books.ts
src/lib/book-metadata.ts
src/app/api/books/[id]/summary/route.ts
src/app/api/books/[id]/reviews/route.ts
src/app/api/books/[id]/reviews/[reviewId]/vote/route.ts
```

---

## 3. How Smart Notes currently works

```
Open book
  → BookReader fetchTipsForBook(book.id)
  → GET /api/tips/[bookId]  (auth required)
  → Firestore books/{bookId}/tips ordered by `order`
  → On nav / readerReady: getContext().text
  → visibleTips = tips where strip(pageText).includes(strip(anchor.text))
  → ReaderNotesSidebar lists visibleTips (“On this page”)
```

`TipDoc` fields: `type`, `title`, `body`, `anchorText`, optional `chapterHref` / `pageNumber`, `references[]`, `order`.

`TipCard` (client) does **not** currently have `bookId`, `source` (`ai` | `user`), or `createdAt` even though the design doc lists them.

Anchor match is **naive substring** after collapsing whitespace. Short/generic anchors will false-positive; missing whitespace/punctuation will false-negative. Chinese books (e.g. 福尔摩斯探案全集) need anchors that actually appear in the extracted page text (EPUB HTML → text may not match PDF/TXT the same way).

---

## 4. Challenges / where we got stuck (this window)

1. **Summaries empty** until Google Books API was enabled + API key in Doppler. Matching needs author; filenames were title-only until OPF/PDF author extract.
2. **Reviews as a new page** — user wanted the **same overlay**. We briefly added `/library/[bookId]/reviews/page.tsx` and then deleted it.
3. **Base UI console error:** `Button` + `render={<Link />}` with default `nativeButton`. Reviews back control is now a real `<button>` + `onClick` panel switch.
4. **Histogram stars** looked like a staircase because each row rendered N stars without a fixed-width column.
5. **Reader chrome vs shadcn Sidebar:** nested right sidebar is viewport-fixed. That was the mode-switcher / centering / no-flip bug. **In-flow aside only.**
6. **Vitest + jsdom ESM** on Node 20 — reviews unit tests run; some reader tests may not in this environment.
7. **Old public reviews:** only the current user’s written review is backfilled on first GET; everyone else must re-save.

---

## 5. Mistakes to avoid in Smart Notes (and in general)

1. **Do not nest `SidebarProvider` / `Sidebar side="right"` inside the reader** for Smart Notes. It will cover the mode switcher and break pagination again. Keep the in-flow `<aside>`.
2. **Do not send Smart Notes to a new route/page** if the user wants it in the reader — same lesson as reviews.
3. **Do not use `Button` as a `Link` without `nativeButton={false}`.**
4. **Do not invent Next.js 13 `params` as a sync object** — it is a Promise here.
5. **Do not commit secrets** (`.env.local`, Doppler, Google/Firebase keys).
6. **Do not remount `BookReader` when progress fields update** — remount on `book.id` only or you get a max-update-depth loop (existing comment in `book-reader.tsx`).
7. **Do not treat `docs/tip-cards.md` IndexedDB helpers as implemented** — `saveTip` / `loadTipsForBook` in IDB are design-only. Live path is Firestore.
8. **Do not generate tips that cannot match `getContext()` text** — if you AI-generate, use the same page text the filter uses, or tips will never show (“no notes on this page”).
9. **Do not add Report-a-Concern on reviews.**
10. **Do not put StPageFlip on single-page `flip` mode** unless the user asks; `flip` = CSS columns + tap.
11. **Avoid `git commit` unless the user asks.** This handoff is uncommitted until they say so.
12. Dead path leftovers: `bookReviewsPath` / `bookIdFromReviewsPath` in `src/lib/library-path.ts` still mention `/library/{id}/reviews` but that page is gone. Safe to ignore or delete if you touch that file.

---

## 6. Suggested next steps (Smart Notes)

Confirm with the user, then roughly:

1. **Decide source of truth:** keep Firestore `books/{id}/tips` (catalog-wide, all readers see the same tips) vs per-user tips. Current GET is catalog-wide and fits “shared library / Home catalog.”
2. **Seed or generate:**
   - Script or admin write of `TipDoc`s for a few books, **or**
   - `POST /api/tips/generate` (or per-book) with current page text + title/author, persist to Firestore (or user subcollection if they should be private).
3. **Show generation in the panel** when `tips.length === 0` or for the current page (empty state is already in the sidebar).
4. **Click card → jump/highlight** using `anchor.text` / `goToTocItem` / search in the flow pager. Design doc calls this out; not built.
5. **Manual add** from selection (design MVP item 3) only if they still want user-authored tips.
6. Update `docs/tip-cards.md` so it matches Firestore + the in-flow panel (and drop IndexedDB if unused).
7. Tests: tip filter (`strip` match), generate route auth, Firestore write shape. Prefer Node environment tests if jsdom is still broken.
8. Manually verify: open 福尔摩斯探案全集 or an EPUB with seeded tips; toggle notes; flip pages; confirm tips appear/disappear with `getContext()`; confirm mode switcher and Previous/Next still work with the panel open.

---

## 7. User preferences observed

- Overlay over new pages; back chevron stays in the overlay.
- Clean review cards (no report). Histogram stars must actually render and align.
- Reader: page centered in the remaining space; mode switcher and page turn must stay usable with Smart Notes open.
- Concise answers; match existing PageMind chrome (navy, existing cards), not a redesign.
- Doppler for secrets; Google Books key already discussed (GCP **GoldenAI-PageMind**).

---

## 8. Quick reader orientation (still true)

```
AppShell (SidebarProvider, h-svh when reading)
  AppSidebar          ← Contents TOC while reading (ReaderTocProvider session)
  SidebarInset
    BookReader
      header: TOC trigger | My Library | title | mode | font | lightbulb
      body:
        page card (flow-reader / pdf) + Previous/Next footer
        ReaderNotesSidebar  ← in-flow aside, not fixed Sidebar
```

Default mode **`flip`** = single page + tap left 25% prev / else next.  
**`spread`** = StPageFlip when the viewport is wide enough; otherwise two-column paginator.

---

*End of handoff. If the working tree disagrees, trust the code + `git log main -15 --oneline` and update this file.*
