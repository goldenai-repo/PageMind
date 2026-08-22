# HANDOFF — Smart Notes (tip cards)

**Date recorded:** 2026-08-22  
**Task:** Smart Notes — reader-anchored tip cards in the right-hand panel  
**Branch:** `feat/smart-notes` (from `main` after PR #11, `2ec0fe0`)  
**HEAD at handoff:** `0d6fd64` — `Add smart notes jump to related book`  
**Uncommitted at handoff (must keep):** two-page **spread** mode now feeds `getContext()` so “This page” notes appear. Files: `src/lib/readers/flow-reader.ts`, `paginator.ts`, `flip-book.ts`, `src/__tests__/lib/tips.test.ts`.  
**This conversation:** [Smart Notes seeding](d3c570da-a625-42a5-a438-0c2156e0b7f5)  
**Related earlier notes (do not redo):**
- `HANDOFF-COCO.md` (2026-08-21) — **stale.** It still says Smart Notes has no seed pipeline and click-to-jump is missing. Those shipped in this work.
- Catalog titles / Home-vs-shelf overlay routing shipped on this branch as `c367036`. Overlay is **Home only**; personal shelves open the **reader**. Real book title, never the filename.

This file is for a **new conversation with no access to the previous context window**. Trust `git log` + the code if anything here disagrees. Ask before commit or push.

---

## 1. What we were working on

Hang Yin built the Smart Notes chrome (lightbulb → right panel, Firestore tips, match `anchor.text` against the current page). This conversation filled the empty catalog, wired jump + connection links, and fixed display bugs the user actually hit while reading Holmes.

Product lock-ins for this feature:

- Tips are **pre-authored JSON → Firestore**. There is **no** live Claude / generate API. Do not rebuild IndexedDB authoring or `POST /api/tips/generate` unless the user asks.
- Panel is an in-flow `<aside>` (`reader-notes-sidebar.tsx`). **Do not** nest shadcn `Sidebar` (it is `position: fixed` and covers the reader header).
- A card in “This page” shows only when `anchor.text` is a substring of the current view, after whitespace is stripped (`stripTipText` / `tipAnchorInText` in `src/lib/tips.ts`).
- Click a card → `rendition.goToPassage` (chapter + page that contains the quote).
- Internal refs like `/library/{id}` open in the **same tab** (`target=_blank` only for http(s)).

Design doc `docs/tip-cards.md` is **stale** (IndexedDB, user-authored tips, generate API). Runtime source of truth is this handoff + the code.

---

## 2. What is done

### 2a. Seed pipeline and content

| Piece | Where |
|-------|--------|
| Authored tips | `src/data/book-tips.json` keyed by catalog UUID |
| Seed | `doppler run -- npx tsx scripts/seed-tips.ts` — replaces `books/{id}/tips` for each key that exists in Firestore |
| Runtime load | `GET /api/tips/[bookId]` → `fetchTipsForBook` in `src/lib/library-api.ts` |
| Firestore | `books/{bookId}/tips/{order}` (`TipDoc` in `src/lib/library-server.ts`) |

**~48 tips across 12 books.** *A First Course in Probability* still has **none**.

**Holmes** (the book used for almost all QA):

- Title in the Chinese cnepub: 福尔摩斯探案全集 (or similar)
- ID: `ed91998e-cb87-4934-903c-737d5ca91fc5`
- **8 tips**, mostly `chapterHref: OPS/chapter1.html` (前言). Later ones: 可卡因 / `OPS/chapter19.html`, 贝克街 / `OPS/chapter102.html`.
- Opening **王冠宝石案** and seeing “8 in this book” but **zero on this page** is expected. Preface notes do not match that chapter. Use **All notes** or jump to 前言.

**Dummy public-domain pair** so Holmes can link out:

- Title: **莫格街凶杀案**, author Edgar Allan Poe  
- ID: `7e8c2a14-6b5f-4d91-a3e0-1c9f4b8d2e70`  
- File: `scripts/fixtures/rue-morgue.txt`  
- Upload (already done once): `doppler run -- npx tsx scripts/upload-book.ts scripts/fixtures/rue-morgue.txt --title "莫格街凶杀案" --author "Edgar Allan Poe" --id 7e8c2a14-6b5f-4d91-a3e0-1c9f4b8d2e70`  
- Holmes connection card reference: `/library/7e8c2a14-6b5f-4d91-a3e0-1c9f4b8d2e70`

`scripts/export-books.ts` can dump Cloud Storage originals (not only legacy chunks) and supports `--only=`.

If you change `book-tips.json`, **re-seed**. JSON on disk is not live.

### 2b. Reader UI (committed in `eeeb622` / `0d6fd64`)

- Lightbulb toggles notes. **This page / All notes** toggle in the panel.
- Click card → `goToPassage` (`src/lib/readers/flow-reader.ts`, EPUB via `spineIndexForHref` in `src/lib/readers/spine-href.ts`; PDF has a locator too).
- Internal `/library/...` refs stay in-app (no new tab).

### 2c. Bugs fixed in this conversation (user-verified except spread notes — that fix is the uncommitted diff)

**1. Jump to 《莫格街凶杀案》 crashed**

`book-detail-overlay.tsx` used `resolvedMeta?.bookId === book?.id`. When both were null (`undefined === undefined`), it then read `resolvedMeta.title` and Next.js showed: `Cannot read properties of null (reading 'title')`. Deep-link `/library/{poeId}` SSRs the overlay before the catalog row exists.

Fix: `metaMatches` requires both objects. `library-section.tsx` reloads the catalog if the URL id is missing, and **closes the current reader** if `currentBook.id !== selectedBookId` so a notes link can open the other overlay.

**2. Holmes text stuck on the left — scroll mode only, this book only**

Holmes EPUB `OPS/css/main.css` has `body { margin-left: 1%; margin-right: 1% }`. Isolated CSS maps `body` → `:scope` on `.pm-flow-epub`. In scroll mode that class used to sit on the same node as the centered column, so book CSS overwrote `margin: auto`.

Fix: `.pm-scroll-inner` is **only** the centering wrapper (`width: min(44rem, 100%); margin-inline: auto`). Book CSS lives on a **child** flow node. `scrollerEl` (font size / `getContext`) is that child, not the inner wrapper.

Paginated single-page already used `.pm-page-viewport--single { width: min(44rem, 100%); margin-inline: auto }`. Do **not** go back to `width: 100%` + `max-width` + `margin: auto` — that left-aligns the column (auto margins compute against 100% width first).

**3. Notes missing in two-page flipping (`spread`) — uncommitted at this handoff**

Cause: spread starts as a 2-column CSS paginator (notes work), then `upgradeToFlip` destroys the paginator and mounts StPageFlip. `getContext()` only knew paginator / scroll, so it returned `{ text: "" }`. The notes effect depends on `nav`; `emitFlipNav` after mount re-ran the filter against empty text, so cards **disappeared**.

Each flip leaf still contains the **whole chapter** (CSS columns + `translateX`). `innerText` of a leaf is the whole chapter — unusable as a page haystack.

Fix:

- At layout time, measure each CSS column and store `flipPageTexts[]` via `visibleTextInFrame` (`paginator.ts`).
- `getContext()` in flip mode uses `textForFlipSpread(flipPageTexts, flip.index())` (left leaf + facing leaf).
- `goToPassage` calls `flip.turnTo(page)` (`FlipHandle.turnTo` → `turnToPage`, no animation).
- If the user clicks a note while the paginator is still up (upgrade in flight), `pendingFlipLeaf = paginatorPage * 2` so the flip book opens on that spread instead of page 0.

Verify: Holmes, **Two-page spread**, 前言 (or any page whose quote is on the open pair). “This page” should list matching cards. Flip the spread; the list should change. Click a card in All notes; the book should turn to that leaf.

---

## 3. Tech stack (this feature)

| Layer | Choice |
|-------|--------|
| App | Next.js **16** — not the Next in training data. Read `AGENTS.md` + `node_modules/next/dist/docs/`. Route `params` is a **Promise**. |
| UI | React client, Tailwind v4, shadcn/Base UI |
| Auth / data | Firebase Auth + Admin Firestore + Cloud Storage. Project **goldenai-pagemind**. Secrets via **Doppler** (`npm run dev` → `doppler run -- next dev`). Never commit `.env.local`. |
| Tips | Firestore `books/{id}/tips`, read-only at runtime |
| Reader | TXT/EPUB `createFlowReader`; PDF pdf.js; `spread` = StPageFlip (`page-flip`) after a paginated fallback |
| Tests | Vitest. Node tests for `tips.ts` / `spine-href` / `textForFlipSpread` are green. jsdom reader tests can fail on Node 20 (`ERR_REQUIRE_ESM`) — pre-existing; do not rewrite Vitest unless asked. |

**Key files**

```
src/data/book-tips.json
scripts/seed-tips.ts
scripts/upload-book.ts
scripts/fixtures/rue-morgue.txt
src/app/api/tips/[bookId]/route.ts
src/lib/tips.ts
src/lib/library-api.ts                 # fetchTipsForBook
src/lib/library-server.ts              # TipDoc
src/components/book-reader.tsx         # visibleTips from getContext
src/components/reader-notes-sidebar.tsx
src/components/book-detail-overlay.tsx # metaMatches null guard
src/components/library-section.tsx     # reload missing id; leave reader on URL book change
src/lib/readers/flow-reader.ts         # getContext, goToPassage, scroll wrapper, flip texts
src/lib/readers/paginator.ts           # visibleTextInFrame, textForFlipSpread
src/lib/readers/flip-book.ts           # turnTo
src/lib/readers/spine-href.ts
src/app/globals.css                    # .pm-page-viewport--single, .pm-scroll-inner
```

Reader modes (`src/lib/readers/reader-mode.ts`): `flip` (single page) | `scroll` | `spread` (two-page StPageFlip).

---

## 4. Challenges / where we got stuck

1. **Empty catalog.** Old `book-tips.json` IDs were for books no longer in Firestore. Until we re-keyed and seeded, every title showed “No smart notes for this book yet.”
2. **Anchor matching is literal.** Tips only fire if the exact `anchorText` appears on the current view (whitespace-insensitive). Preface Holmes notes will not show on 王冠宝石案. The user first thought the feature was broken.
3. **`undefined === undefined` in the overlay.** Optional chaining on the comparison, not on the property access, crashed the Poe deep-link.
4. **Book CSS vs our layout.** Isolated EPUB CSS is applied to the flow root. Any `html`/`body` margin/width in the book will fight centering if that class is on the wrapper we use for measure. Holmes is the example; other books may have similar CSS.
5. **Spread `getContext` was never implemented.** Flip upgrade is async; notes looked fine for a frame on the paginator, then vanished. Easy to miss in code review if you only test `flip` / `scroll`.
6. **StPageFlip leaf DOM is not “the page text.”** Whole-chapter HTML plus column transform. Must clip by geometry (or store per-column strings at measure time).

---

## 5. Mistakes to avoid next time

1. **Do not** treat `resolvedMeta?.bookId === book?.id` as a match — both null/undefined is a match. Require both objects.
2. **Do not** put `.pm-flow-epub` / book `contentCss` on the element that owns `margin: auto` centering.
3. **Do not** center with `width: 100%; max-width: 44rem; margin: auto`. Use `width: min(44rem, 100%)`.
4. **Do not** use StPageFlip `innerText` (or the whole leaf) as the notes haystack.
5. **Do not** assume `getContext()` works in every mode because it works in single-page. After `upgradeToFlip`, paginator is gone.
6. **Do not** put tip JSON under stale catalog UUIDs. Seed will skip missing `books/{id}` (`! ${id} not in library — skipping`).
7. **Do not** nest shadcn `Sidebar` inside the reader.
8. **Do not** restore live AI tip generation unless the user asks. Current product is authored JSON.
9. **Do not** `target=_blank` on `/library/{id}` connection links.
10. **Do not** open the book overlay from My Books / Favorite / Want / Finished (Home only).
11. **Do not** display the filename as the title (see older catalog work on this branch).
12. **Do not** invent TXT TOC as equal-size “Part N” chunks.
13. **Do not** invent Next.js APIs from training data — this tree is Next 16; `params` is a Promise.
14. **Ask before commit/push.** Do not commit `.env` / service-account keys.
15. **Do not** rewrite the Vitest/jsdom stack in passing because reader tests fail on Node 20.

---

## 6. Known gaps / not done

- [ ] **Commit the spread-mode notes fix** (uncommitted at handoff) when the user asks, then smoke-test Holmes two-page spread.
- [ ] User smoke: jump 📎 Open 《莫格街凶杀案》 from Holmes All notes → overlay, no null-title crash; Read works.
- [ ] User smoke: Holmes **scroll** mode, text column centered (not left-aligned with a huge gutter).
- [ ] Click-to-jump does **not** highlight the passage. Jump only.
- [ ] `docs/tip-cards.md` still describes the old IndexedDB / generate design.
- [ ] *A First Course in Probability* has no tips.
- [ ] No per-page “Generate tips” button (intentionally removed).
- [ ] `HANDOFF-COCO.md` still describes Smart Notes as the unstarted next task.
- [ ] PR `feat/smart-notes` when the user asks (branch has catalog-title work + this feature).
- [ ] Cover images still client-extract + IndexedDB, not Storage.
- [ ] jsdom Vitest `ERR_REQUIRE_ESM` on Node 20.

---

## 7. Next step

1. Refresh the app. Holmes → two-page spread → 前言 (or All notes → click a preface card). Confirm “This page” cards appear and update when flipping.
2. If that looks good, ask the user whether to **commit** the uncommitted reader files + this `HANDOFF.md`, then whether to **PR** `feat/smart-notes`.
3. Optional polish only if they ask: highlight the anchor after `goToPassage`; rewrite `docs/tip-cards.md`; author Probability tips; more connection pairs.
4. Do not start a new product surface (AI generate, user-authored tips) without asking.

---

## 8. User preferences observed

- Concise English is fine.
- QA is on **Holmes**, especially 前言 ↔ 《莫格街凶杀案》 and reading-mode layout (scroll centering, spread notes).
- Overlay is a **bookstore (Home)** feature. Notes links that go to `/library/{id}` should open that overlay, not crash, even if another book is currently open.
- Pre-authored notes, not live generation.
- Ask before commit/push.

---

*End of handoff. If the working tree disagrees, trust `git log` + code and update this file.*
