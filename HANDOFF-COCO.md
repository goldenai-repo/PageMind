# HANDOFF — PageMind Reader Work (Coco)

**Date recorded:** 2026-07-22  
**Branch:** `feat/user-library`  
**Working tree at handoff:** clean (changes already committed)  
**Prior chat transcript:** `/Users/yiminliu/.cursor/projects/Users-yiminliu-dev-PageMind/agent-transcripts/658e6d72-f850-46be-ac1a-966a7e338610/658e6d72-f850-46be-ac1a-966a7e338610.jsonl`

This note is for a **new conversation with no access to the previous context window**. Read this first before changing the book reader.

---

## 1. What task were we working on?

**Book reader UX for PageMind** — reading modes + a contents sidebar that works for EPUB, TXT, and PDF.

Original product goals (user):

1. **Default single-page mode** — paginated one page at a time (later revised: *no* page-flip animation; tap left/right to turn).
2. **Wide-screen scroll mode** — continuous vertical scroll; white sheet fills the reading area; text column stays readable/narrow.
3. **Dual-page (spread) mode** — two pages side-by-side with a real book-flip UI library.
4. **Persist last mode** across books via `localStorage`.
5. **Priority:** EPUB + TXT first; PDF modes later (PDF still has TOC + page nav only).
6. **Contents sidebar** for all formats (not EPUB-only), with a reliable way to reopen after close (like the library app shell).

---

## 2. What is done (current state)

### Commits on this branch (relevant)

| Commit   | Message                      | When (local)        |
|----------|------------------------------|---------------------|
| `cd19f7f` | add reading page mode       | 2026-07-22 ~15:30   |
| `ebfcb63` | add side bar to book page   | 2026-07-22 ~15:57   |

### Reading modes (TXT / EPUB — reflowable)

| Mode id   | Behavior (final, after revisions) | Animation |
|-----------|-----------------------------------|-----------|
| `flip` (default) | Single paginated page; full-width white card; **narrow centered text column**; **tap right → next, tap left → prev** (ignores links/selection) | **None** (CSS columns pagination) |
| `scroll` | Continuous scroll; **`.pm-scroll` white sheet always fills outer box width + `min-height: 100%`**; height grows with text; **narrow `.pm-scroll-inner` column** | None |
| `spread` | Two-page landscape book filling the reading area; gray outer background shows around/behind pages | **`page-flip` (StPageFlip)** via `mountFlipBook({ spread: true })` |

Mode persistence: `localStorage` key `pagemind:reader-mode`, exposed through a `useSyncExternalStore` store in `src/lib/readers/reader-mode.ts` (SSR-safe; avoids hydration / setState-in-effect lint).

### Contents sidebar (all formats)

Data-driven React sidebar in `book-reader.tsx` (not DOM-built inside engines):

| Format | TOC source |
|--------|------------|
| EPUB   | Book nav/TOC → chapters (section + optional fragment) |
| TXT    | Synthetic “parts” from section splits (`Part N — …`) |
| PDF    | One entry per page (`Page N`) |

APIs added on `ReaderRendition` / engines:

- `onToc` / `onTocActive` callbacks
- `goToTocItem?(id)`
- optional `setMode?(mode)` for reflowable readers

### Sidebar chrome (final UX after last UX pass)

- **No X button** in the CONTENTS header (user explicitly rejected it).
- **When open:** `PanelLeft` toggle sits in the CONTENTS header row (left of the “Contents” label) → hides panel.
- **When closed:** same `PanelLeft` control appears as an absolute button at **top-left of the reading area** (`left-2 top-2`) → shows panel again.
- Do **not** put the toggle back in the top app header next to “My Library” unless the user asks — they asked to move it **down** into the contents row.

We did **not** embed the real shadcn `Sidebar` / `SidebarProvider` inside the reader. Reason: library sidebar is viewport-fixed full-height; the reader is a `fixed inset-0` overlay with its own header + footer. Embedding shadcn Sidebar would overlap chrome. UX matches the library *trigger pattern* (`PanelLeft`), not the full component tree.

### Env / secrets (side discussion, same day)

- Repo has **`.env.local`** (secrets) and **`.env.example`** (template). There is **no** plain `.env` — that is fine for Next.js.
- `.env.local` is **already gitignored** via `.env*` + `!.env.example`.
- Confirmed: `.env.local` is **not tracked** and was **never committed** in history. No further gitignore change needed.

---

## 3. Tech stack (reader-relevant)

- **App:** Next.js (this repo’s Next has breaking changes — read `node_modules/next/dist/docs/` / follow `AGENTS.md` before inventing APIs).
- **UI:** React client components, Tailwind, shadcn/ui (library shell uses `@/components/ui/sidebar`; reader uses a custom aside).
- **Flip library:** [`page-flip`](https://www.npmjs.com/package/page-flip) ^2.0.7 (StPageFlip), wrapper `src/lib/readers/flip-book.ts`, types in `src/types/page-flip.d.ts`.
- **PDF:** pdf.js via existing `src/lib/readers/pdf.ts`.
- **EPUB / TXT:** custom engines + shared `createFlowReader` in `src/lib/readers/flow-reader.ts`; pagination helpers in `paginator.ts`.
- **Backend (context only):** Firebase (migrated from Supabase earlier on this branch) — not the focus of the reader work.
- **Package manager / scripts:** project uses bun in places (`bunx next`); lockfile `bun.lock`.

### Key files

```
src/components/book-reader.tsx      # Reader shell, mode toolbar, TOC sidebar UI
src/lib/readers/flow-reader.ts      # flip/scroll/spread orchestration for TXT/EPUB
src/lib/readers/flip-book.ts        # StPageFlip mount (spread sizing)
src/lib/readers/reader-mode.ts      # Mode type + localStorage + external store
src/lib/readers/types.ts            # ReaderTocItem, ReaderRendition
src/lib/readers/txt.ts              # Parts TOC + flow reader
src/lib/readers/epub-engine.ts      # Chapter TOC + flow reader
src/lib/readers/pdf.ts              # Page TOC + goToTocItem
src/lib/readers/paginator.ts        # CSS-column pagination
src/app/globals.css                 # .pm-page-viewport*, .pm-scroll*, .toc-link, flip styles
src/components/app-shell.tsx        # Library shadcn SidebarProvider + SidebarTrigger (reference UX)
src/components/app-sidebar.tsx      # Library nav sidebar
```

---

## 4. Decisions we made (and how)

| Decision | Why / how |
|----------|-----------|
| Use **StPageFlip only for `spread`**, not for default `flip` | User revised: single-page should feel like the old simple pagination + tap-to-turn, not a 3D flip UI. |
| Default mode remains id **`flip`** even without flip animation | Avoid renaming storage key / API mid-flight; “flip” = single-page mode historically. **Docs comment in `reader-mode.ts` is stale** (still says StPageFlip for flip) — update when touched. |
| Shared **`createFlowReader`** for TXT + EPUB | One place for mode switching, resize reflow, TOC active callbacks, tap nav. |
| **React-owned TOC** via `onToc` / `goToTocItem` | EPUB used to paint TOC into a DOM node; PDF/TXT had nothing. Unified model. |
| **Do not drop full shadcn Sidebar into reader** | Fixed overlay + own header/footer; use PanelLeft toggle pattern instead. |
| **`useSyncExternalStore` for mode** | Fixed hydration mismatch and React Compiler lint against `setState` in `useEffect` when reading `localStorage`. |
| **Even page count padding** in spread | Blank trailing page so last spread isn’t a lone half. |
| **`computeSpreadSize` subtracts contentEl padding** | Prevented right-page clipping at the edge of the reading area. |
| **Narrow measure via CSS** (`.pm-page-viewport--single`, `.pm-scroll-inner`, max-width ~44rem) | Full-width white card / sheet, readable text column, centered. |

---

## 5. Challenges / where we got stuck

1. **StPageFlip sizing / layout** — Early single-page flip attempts had zero height / odd positioning. Fixed with `pm-flip-frame`, fixed width, `autoSize`, then later limited StPageFlip to spread only.
2. **Mode persistence looked broken** — `localStorage` had the right value but UI reset to `flip` after reload because of SSR/hydration. Fixed with external store + server snapshot = default.
3. **`shadcn add sidebar` cancelled once** — retry with `--overwrite --yes` worked for the library shell (separate from reader TOC).
4. **Browser verification artifacts** — Screenshots of background tabs / downscaled captures misled (sidebar looked 1px wide; text looked off-center). Prefer CDP/`getBoundingClientRect` + a11y snapshot over trusting one screenshot.
5. **Synthetic PDF in demo hung** — Hand-built PDF with Helvetica text needs pdf.js `standardFontDataUrl`; demo switched to vector rects for smoke tests. Real user PDFs are fine.
6. **Discoverability of sidebar reopen** — Toggle existed on the far-right header but users couldn’t find it after closing with X. Iterated placement until user asked: remove X, move toggle into CONTENTS row, reopen control on reading area when closed.
7. **Temporary `/auth/reader-demo` page** — Used for manual browser checks with synthetic TXT/EPUB/PDF; **deleted after verification**. Recreate locally if you need interactive checks; do not leave it committed unless asked.

---

## 6. Mistakes / pitfalls to avoid next time

1. **Don’t reintroduce StPageFlip for single-page (`flip`)** unless the user explicitly asks for flip animation again.
2. **Don’t put an X-only close on the TOC** without a equally obvious reopen control — users felt trapped.
3. **Don’t assume screenshot = truth** for layout (esp. background Electron browser tabs).
4. **Don’t use `setState` synchronously in `useEffect` for `localStorage` mode** — use the existing store helpers.
5. **Don’t commit `.env.local`** — already ignored; if someone force-adds it, stop. Prefer documenting vars in `.env.example` with no secrets.
6. **Don’t wire PDF into `setMode` / flow-reader without a design** — PDF is raster pages today; modes were scoped to reflowable formats.
7. **Update stale comments** when behavior changes (`reader-mode.ts` still describes `flip` as StPageFlip).
8. **Avoid inventing Next.js APIs from training data** — this project’s Next differs; check local docs (`AGENTS.md`).
9. **Demo pages under `src/app/auth/reader-demo`** — delete when done so they don’t ship.
10. **TOC `aria-current` on `role="treeitem"`** — use `aria-selected` (lint/a11y).

---

## 7. Known gaps / not done

- **PDF reading modes** (scroll / spread / single with same UX as EPUB/TXT) — deferred.
- **Nested TOC levels** — `ReaderTocItem.level` exists but UI may not indent deeply yet.
- **`reader-mode.ts` top-of-file comment** out of date vs actual `flip` behavior.
- Optional polish: keyboard shortcuts for TOC toggle; remember TOC open/closed in `localStorage`; mobile layout for sidebar.
- Broken EPUB cover/image “alt” placeholders can still appear for some books (seen in user screenshot of 东方快车谋杀案) — separate content/asset issue, not sidebar.

---

## 8. Suggested next steps (for the next conversation)

Ask the user what they want next. Reasonable candidates:

1. **Polish / bugfix** current reader (stale docs, image alt in EPUB, TOC indentation, mobile).
2. **PDF modes** if they want parity with TXT/EPUB.
3. **Progress persistence** (last page/chapter per book) — not implemented in this thread.
4. Continue other `feat/user-library` library/upload work outside the reader.

When changing modes or sidebar:

1. Touch `flow-reader.ts` + `globals.css` + `book-reader.tsx` together.
2. Manually verify TXT + EPUB + PDF open/close TOC and all three modes on a real book.
3. Run eslint on touched files; don’t rely only on `tsc` (test setup still has pre-existing `vi` global typing noise).

---

## 9. Quick “how it works” (orientation)

```
BookReader
  ├─ mode via useSyncExternalStore(reader-mode store)
  ├─ mounts mountTxtReader | mountEpubReader | mountPdfReader
  │     └─ (TXT/EPUB) createFlowReader → renderScroll | renderPaginated+tap | renderPaginated+upgradeToFlip
  ├─ toc[] / activeTocId from onToc / onTocActive
  └─ aside CONTENTS + PanelLeft hide/show
```

Default mode: **`flip`** = single page + tap nav.  
Flip animation library: **only `spread`**.

---

## 10. User preferences observed this thread

- Direct, concise answers.
- Prefer matching existing library UX patterns when possible.
- Care about reopenability of sidebars.
- Do **not** commit secrets; ask before committing generally (user rules).
- Frontend: avoid generic AI aesthetic; but **reader should stay consistent with existing PageMind chrome** (navy, existing cards/shadows) rather than a redesign.

---

*End of handoff. If anything in the working tree disagrees with this file, trust the code + git log and update this document.*
