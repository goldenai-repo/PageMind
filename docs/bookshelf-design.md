# Design Doc - PageMind Bookshelf (收藏 · 进度 · 评分)

**Author:** Coco  
**Version:** 1.2  
**Date:** 2026-08-07  
**Branch:** `feat/user-library`  
**Change in 1.2:** Rename Phase 1 storage APIs for clarity (pending code rename after approval).

---

## Objective

Let users browse uploaded books, open them into My Books, track reading progress, favorite books, and rate them with stars — Apple Books–style shelf UI.

**Out of scope:** comments, highlights, deleting uploads from All Books.

---

## Background

PageMind already has:

- Firebase Auth
- Library shelves (All Books / My Books / Favorite / Want / Finished)
- Upload + reader (PDF / EPUB / TXT)
- Books stored per user in **IndexedDB** (no Firestore for books yet)

Missing today: progress bar, star rating, delete-from-My-Books, open-from-All-Books → add to My Books.

**Product rules (locked):**

1. Upload → appears in **All Books**
2. Click/open a book → opens reader **and** adds to **My Books**
3. `⋯` on My Books → **Favorite** or **Delete** (Delete = remove from My Books only; book stays in All Books)
4. `⋯` on All Books → **Favorite** (no delete)
5. Under each cover: **progress % + bar**, then **5-star rating**

---

## Workflow

```
Upload book
    → save to IndexedDB
    → show in Book Store → All Books

User clicks book (All Books)
    → set inMyLibrary = true
    → open reader
    → book appears under My Library → My Books

While reading
    → update lastReadPage / totalPages / progressPercent
    → show % + progress bar under cover

User rates book
    → click 1–5 stars under cover (click same star again → clear)

User favorites
    → from All Books or My Books ⋯
    → show under Favorite

User deletes (My Books only)
    → inMyLibrary = false
    → remove from My Books / Favorite
    → still visible in All Books
```

---

## Methodology

### Phase 1 (now) — local only

| Layer | Choice | Reason |
|---|---|---|
| App | Next.js + React + Tailwind | Existing PageMind stack |
| Auth | Firebase Auth | Already wired |
| Storage | **IndexedDB** | Already used for books; no Firestore yet |
| Reader | Existing PDF / EPUB / TXT engines | Emit page + total for progress |

### Phase 2 (later) — cloud sync

| Layer | Choice | Reason |
|---|---|---|
| Metadata | Cloud Firestore | Fits catalog + per-user state; team already on Firebase |
| Files | Firebase Storage | Book binaries too large for Firestore |
| Cache | IndexedDB | Offline / avoid re-download |

**Not using:** Supabase/Postgres (migrated away), catalog delete APIs.

---

## Data Schema

Two logical parts (Phase 1: one IndexedDB record with both; Phase 2: split collections).

### A. Catalog book (All Books / upload)

| Column | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `title` | string | From filename |
| `ext` | `pdf \| epub \| txt` | |
| `cover` | string | Gradient / cover token |
| `size` | string | Display size |
| `sizeBytes` | number | Optional |
| `data` | File / ArrayBuffer / string | Phase 1 file bytes in IDB |
| `storagePath` | string | Phase 2 only |
| `totalPages` | number \| null | Set on first open |
| `addedAt` | Date | |

### B. User book state (My Library)

| Column | Type | Notes |
|---|---|---|
| `inMyLibrary` | boolean | My Books membership |
| `favorite` | boolean | Favorite shelf |
| `status` | `want \| finished` \| unset | Existing shelves |
| `rating` | `0–5` | 0 = unrated |
| `lastReadPage` | number | Last page read |
| `totalPages` | number \| null | For percent |
| `progressPercent` | number | `round(lastReadPage / totalPages * 100)` |
| `locator` | object \| null | Resume (section/page/mode for EPUB/TXT) |
| `lastOpenedAt` | Date \| null | |

### Phase 1 IndexedDB

- DB: `pagemind_{userId}`, store: `books`, keyPath: `id`
- Embed A + B on one record (current pattern)
- Bump `DB_VERSION`; default missing fields on read

### Phase 2 Firestore (future)

```
books/{bookId}                 ← catalog
users/{userId}/books/{bookId}  ← user state
```

Files → Firebase Storage path `books/{userId}/{bookId}/...`

---

## Data Selection: 流量 / 储存预估

**Assumptions:** ~1,000 users, ~1,000 books, ~20 My Books per user, progress saved ~30× per reading session (debounced).

### Traffic

| Action | Approx volume | Notes |
|---|---|---|
| List All Books / My Books | Low | Dozens of rows per page view |
| Progress writes | Medium | Debounced; still small for Firestore later |
| Rating / favorite | Low | Rare clicks |

Phase 1: all local → **no server traffic** for books.

### Storage

| Data | Estimate |
|---|---|
| Metadata (1k books × ~1 KB) | **~1 MB** |
| User state (1k users × 20 × ~0.4 KB) | **~8 MB** |
| Files (1k books × ~5 MB avg) | **~5 GB** |

→ Metadata is cheap. **Files dominate.**  
Phase 1: files sit in each browser’s IndexedDB.  
Phase 2: ~5 GB on Firebase Storage for the 1k-book target.

---

## API

> **Status:** naming proposal — **do not rename code until approved**.
> Design doc language: English only. Bilingual explanations happen in chat when needed.

### Why Phase 1 functions take `userId`

Phase 1 stores books in browser IndexedDB named `pagemind_{userId}`.  
`userId` selects which user’s local database to open — not “filter by author.”  
Phase 2 HTTP APIs take identity from the auth session instead (no `userId` in the path).

---

### Rename map (old → proposed)

| Old name (current code) | New name (proposed) |
|---|---|
| `loadBooks` | `listAllBooks` |
| `saveBook` | `putBook` |
| `deleteBook` | `deleteUploadedBook` *(internal only; not exposed in UI)* |
| `setLibraryMembership` | split → `addToMyBooks` / `removeFromMyBooks` |
| `setFavorite` | `setBookFavorite` |
| `setRating` | `setBookRating` |
| `updateProgress` | `updateReadingProgress` |
| *(new)* | `setBookStatus` — Want to Read / Finished |
| private `getBook` | `getBookById` (optional export) |

**Note on two confusing names (revised):**
- Avoided `listUploadedBooks` → use **`listAllBooks`** (matches the UI label “All Books”).
- Avoided `upsertBook` (“upsert” is DB jargon) → use **`putBook`** (write/replace one full book record).

---

### Phase 1 — local module API (`src/lib/storage.ts`)

#### 1. `listAllBooks(userId): Promise<LibraryBook[]>`

Returns every book in this user’s local catalog — what the **All Books** page shows.

- Includes books that are only uploaded and not yet in My Books.
- Does **not** filter by favorite / want / finished (the UI filters after loading, or a later helper can).
- Phase 1 each item still includes file bytes + user-state fields on the same record.

#### 2. `putBook(userId, book): Promise<void>`

Writes **one full book record** into IndexedDB.

- If `book.id` is new → creates the record (this is what **Upload** does).
- If `book.id` already exists → replaces the whole record with the new object.
- This is a **storage write primitive**, not a product action like “Want to Read” or “Favorite.”
- Higher-level helpers (`addToMyBooks`, `setBookFavorite`, …) load a book, change fields, then call `putBook`.

#### 3. `getBookById(userId, bookId): Promise<LibraryBook | null>`

Fetch a single book by id. Returns `null` if it does not exist.

#### 4. `addToMyBooks(userId, bookId): Promise<LibraryBook | null>`

Sets `inMyLibrary = true` so the book appears under **My Books**.  
Also used when the user opens a book from All Books.

#### 5. `removeFromMyBooks(userId, bookId): Promise<LibraryBook | null>`

User-facing **Delete** on My Books: clears `inMyLibrary` / favorite / status.  
**Keeps** the file in the catalog → book still appears in **All Books**.  
Not a permanent file delete.

#### 6. `setBookFavorite(userId, bookId, favorite: boolean): Promise<LibraryBook | null>`

Turns favorite on or off. When favoring, also sets `inMyLibrary = true`.

#### 7. `setBookRating(userId, bookId, rating: 0|1|2|3|4|5): Promise<LibraryBook | null>`

Sets the user’s personal star rating (`0` = unrated / cleared).

#### 8. `setBookStatus(userId, bookId, status: "want" | "finished" | null): Promise<LibraryBook | null>`

Sets Want to Read / Finished / clear. Also ensures `inMyLibrary = true` when status is set.

#### 9. `updateReadingProgress(userId, bookId, progress): Promise<LibraryBook | null>`

Persists reading progress: `lastReadPage`, `totalPages`, `progressPercent`, `locator`, `lastOpenedAt`.  
Also sets `inMyLibrary = true`; at 100% may set `status = "finished"`.

#### 10. `deleteUploadedBook(userId, bookId): Promise<void>` *(internal only — no UI)*

Permanently removes the catalog row and file bytes from IndexedDB.  
Not offered in the bookshelf UI (users cannot delete from All Books).

---

### Phase 1 call cheat-sheet (product action → API)

| User action | API |
|---|---|
| Upload file | `putBook` (new record, `inMyLibrary: false`) |
| Open All Books page | `listAllBooks` |
| Add to My Books | `addToMyBooks` |
| Delete from My Books | `removeFromMyBooks` |
| Favorite / unfavorite | `setBookFavorite` |
| Rate stars | `setBookRating` |
| Want to Read | `setBookStatus(..., "want")` |
| Mark Finished | `setBookStatus(..., "finished")` |
| Turn pages while reading | `updateReadingProgress` |

---

### Phase 2 — HTTP (future; aligned names)

Auth user comes from session cookie — no `userId` in path.

| Method | Path | Maps to Phase 1 idea |
|---|---|---|
| `GET` | `/api/books` | `listAllBooks` |
| `POST` | `/api/books` | create catalog after Storage upload (`putBook` create path) |
| `GET` | `/api/books/:bookId` | `getBookById` |
| `GET` | `/api/library?shelf=mine\|favorite\|want\|finished` | filtered My Library lists |
| `POST` | `/api/library/:bookId` | `addToMyBooks` |
| `DELETE` | `/api/library/:bookId` | `removeFromMyBooks` |
| `PUT` | `/api/library/:bookId/favorite` | `setBookFavorite` |
| `PUT` | `/api/library/:bookId/rating` | `setBookRating` |
| `PUT` | `/api/library/:bookId/status` | `setBookStatus` |
| `PATCH` | `/api/library/:bookId/progress` | `updateReadingProgress` |

No `DELETE /api/books/:id` in product scope.

### Reader hook (unchanged conceptually)

```ts
onProgress?: (p: {
  lastReadPage: number;
  totalPages: number;
  progressPercent: number;
  locator: ReadingLocator;
}) => void;
```

Reader calls parent → parent calls `updateReadingProgress`.

---

## Implementation

### UI (card under cover)

```
[ COVER ]
92% ████░░  ⋯
★★★★☆
```

### Phase 1 steps

1. Extend `LibraryBook` + bump IndexedDB version (rating, progress, locator)
2. Add `StarRating` + progress row on book cards
3. Open from All Books → `inMyLibrary = true` → reader
4. My Books `⋯`: Favorite, Delete (membership only)
5. All Books `⋯`: Favorite only (no Delete)
6. Reader emits progress; debounce save; resume on reopen
7. Upload stays All Books–only until opened
8. Tests for percent helper + delete-from-My-Books behavior

### Phase 2 steps (later)

1. Provision Firestore + Storage
2. Upload → Storage + `books` doc
3. User state → `users/{uid}/books/{bookId}`
4. Keep IndexedDB as cache
5. Still no user-facing delete from All Books

### Files to touch (Phase 1)

- `src/lib/books.ts`
- `src/lib/storage.ts`
- `src/components/library-section.tsx`
- `src/components/upload-section.tsx`
- `src/components/book-reader.tsx`
- `src/lib/readers/*`
- New: `book-card.tsx`, `star-rating.tsx`

### Success

- Upload → All Books  
- Open → My Books + progress bar updates  
- Favorite works  
- Delete removes from My Books, **not** All Books  
- Stars persist after refresh  

---

*Next: implement Phase 1 (IndexedDB).*
