# Design Doc - PageMind Bookshelf (收藏 · 进度 · 评分)

**Author:** Coco  
**Version:** 1.3  
**Date:** 2026-08-07  
**Branch:** `feat/user-library`  

**Changelog**
- **1.3:** Rename **All Books → Home**; shelf id `store` → `home`; hide personal progress on Home; API `listAllBooks` → `listHomeBooks`.
- **1.2:** Rename Phase 1 storage APIs for clarity (pending code rename after approval).

---

## Objective

Let users browse the shared catalog on **Home**, open books into **My Books**, track personal reading progress, favorite books, and rate them with stars — Apple Books–style shelf UI.

**Out of scope:** comments, highlights, deleting uploads from Home.

---

## Background

PageMind already has:

- Firebase Auth
- Library shelves (Home / My Books / Favorite / Want / Finished)
- Upload + reader (PDF / EPUB / TXT)
- Books stored per user in **IndexedDB** (no Firestore for books yet)

**Product rules (locked):**

1. Upload → appears on **Home**
2. Click/open a book → opens reader **and** adds to **My Books**
3. `⋯` on My Books → **Favorite**, **Want to Read**, or **Delete** (Delete = remove from My Books only; book stays on Home)
4. `⋯` on Home → **Add to My Books**, **Favorite**, **Want to Read** (no delete, no personal progress)
5. Under each cover: title; on **My Library** shelves also **progress % + bar**; **5-star rating** (read-only avg on Home; interactive on My Library)
6. Progress is **per-user** — never shown on Home (Home becomes a shared catalog in Phase 2)

---

## Workflow

```
Upload book
    → save to IndexedDB
    → show on Browse → Home

User clicks book (Home)
    → set inMyLibrary = true
    → open reader
    → book appears under My Library → My Books

While reading
    → update lastReadPage / totalPages / progressPercent
    → show % + progress bar under cover on My Library shelves only

User rates book (My Library)
    → click 1–5 stars under cover (click same star again → clear)
    → Home shows read-only aggregate (Phase 1: same personal value)

User favorites
    → from Home or My Books ⋯
    → show under Favorite

User deletes (My Books only)
    → inMyLibrary = false
    → remove from My Books / Favorite
    → still visible on Home
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

### A. Catalog book (Home / upload)

Shared catalog fields — what every reader can see on Home later.

| Column | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `title` | string | From filename |
| `ext` | `pdf \| epub \| txt` | |
| `cover` | string | Gradient fallback |
| `coverImage` | Blob \| null | Extracted/generated thumbnail |
| `size` | string | Display size |
| `sizeBytes` | number | Optional |
| `data` | File / ArrayBuffer / string | Phase 1 file bytes in IDB |
| `storagePath` | string | Phase 2 only |
| `totalPages` | number \| null | Set on first open (may stay catalog-level for PDF) |
| `addedAt` | Date | |

### B. User book state (My Library — personal)

| Column | Type | Notes |
|---|---|---|
| `inMyLibrary` | boolean | My Books membership |
| `favorite` | boolean | Favorite shelf |
| `status` | `want \| finished` \| unset | Existing shelves |
| `rating` | `0–5` | 0 = unrated (personal; Home may show avg later) |
| `lastReadPage` | number | Last page read (**personal — not on Home UI**) |
| `totalPages` | number \| null | For percent |
| `progressPercent` | number | `round(lastReadPage / totalPages * 100)` (**personal**) |
| `locator` | object \| null | Resume payload |
| `lastOpenedAt` | Date \| null | |

### Shelf ids (UI)

| Shelf id | Label | Shows progress? |
|---|---|---|
| `home` | Home | **No** |
| `mine` | My Books | Yes |
| `favorite` | Favorite | Yes |
| `want` | Want to Read | Yes |
| `finished` | Finished | Yes |

Legacy `?shelf=store` redirects to Home.

### Phase 1 IndexedDB

- DB: `pagemind_{userId}`, store: `books`, keyPath: `id`
- Embed A + B on one record (current pattern)
- Bump `DB_VERSION`; default missing fields on read

### Phase 2 Firestore (future)

```
books/{bookId}                 ← catalog (Home)
users/{userId}/books/{bookId}  ← user state (progress / favorite / rating)
```

Files → Firebase Storage path `books/{userId}/{bookId}/...`

---

## Data Selection: traffic / storage estimates

**Assumptions:** ~1,000 users, ~1,000 books, ~20 My Books per user, progress saved ~30× per reading session (debounced).

### Traffic

| Action | Approx volume | Notes |
|---|---|---|
| List Home / My Books | Low | Dozens of rows per page view |
| Progress writes | Medium | Debounced; per-user docs only |
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

> **Status:** naming proposal — storage helpers in code may still use old names until rename is approved/applied.  
> Design doc language: English only.

### Why Phase 1 functions take `userId`

Phase 1 stores books in browser IndexedDB named `pagemind_{userId}`.  
`userId` selects which user’s local database to open — not “filter by author.”  
Phase 2 HTTP APIs take identity from the auth session instead (no `userId` in the path).

---

### Rename map (old → proposed)

| Old name (current / prior) | New name (proposed) |
|---|---|
| `loadBooks` | `listHomeBooks` |
| `saveBook` | `putBook` |
| `deleteBook` | `deleteUploadedBook` *(internal only; not exposed in UI)* |
| `setLibraryMembership` | split → `addToMyBooks` / `removeFromMyBooks` |
| `setFavorite` | `setBookFavorite` |
| `setRating` | `setBookRating` |
| `updateProgress` | `updateReadingProgress` |
| *(new)* | `setBookStatus` — Want to Read / Finished |
| private `getBook` | `getBookById` (optional export) |
| UI “All Books” / shelf `store` | **Home** / shelf `home` |
| Prior proposal `listAllBooks` | **`listHomeBooks`** |

**Notes:**
- `listHomeBooks` = catalog list for the **Home** page (not “my reading list”).
- `putBook` = write/replace one full book record (storage primitive, not “Want to Read”).

---

### Phase 1 — local module API (`src/lib/storage.ts`)

#### 1. `listHomeBooks(userId): Promise<LibraryBook[]>`

Returns every book in this user’s local catalog — what the **Home** page shows.

- Includes books that are only uploaded and not yet in My Books.
- Does **not** filter by favorite / want / finished.
- UI must **not** render personal progress on this list (even if fields exist on the record in Phase 1).

#### 2. `putBook(userId, book): Promise<void>`

Writes **one full book record** into IndexedDB.

- If `book.id` is new → creates the record (Upload).
- If `book.id` already exists → replaces the whole record.
- Storage write primitive — not a product shelf action.

#### 3. `getBookById(userId, bookId): Promise<LibraryBook | null>`

Fetch a single book by id. Returns `null` if missing.

#### 4. `addToMyBooks(userId, bookId): Promise<LibraryBook | null>`

Sets `inMyLibrary = true`. Also used when opening a book from Home.

#### 5. `removeFromMyBooks(userId, bookId): Promise<LibraryBook | null>`

My Books **Delete**: clears library flags; book remains on **Home**.

#### 6. `setBookFavorite(userId, bookId, favorite: boolean): Promise<LibraryBook | null>`

Favorite on/off; favoring also sets `inMyLibrary = true`.

#### 7. `setBookRating(userId, bookId, rating: 0|1|2|3|4|5): Promise<LibraryBook | null>`

Personal star rating (`0` = cleared). Interactive on My Library; Home shows read-only avg.

#### 8. `setBookStatus(userId, bookId, status: "want" | "finished" | null): Promise<LibraryBook | null>`

Want to Read / Finished / clear; ensures My Books when set.

#### 9. `updateReadingProgress(userId, bookId, progress): Promise<LibraryBook | null>`

Persists personal progress + locator. Used by reader; surfaces on My Library shelves only.

#### 10. `deleteUploadedBook(userId, bookId): Promise<void>` *(internal only — no UI)*

Permanently removes catalog row + file. Not offered on Home.

---

### Phase 1 call cheat-sheet

| User action | API |
|---|---|
| Upload file | `putBook` (new record, `inMyLibrary: false`) |
| Open Home page | `listHomeBooks` |
| Add to My Books | `addToMyBooks` |
| Delete from My Books | `removeFromMyBooks` |
| Favorite / unfavorite | `setBookFavorite` |
| Rate stars | `setBookRating` |
| Want to Read | `setBookStatus(..., "want")` |
| Mark Finished | `setBookStatus(..., "finished")` |
| Turn pages while reading | `updateReadingProgress` |

---

### Phase 2 — HTTP (future; aligned names)

Auth from session cookie — no `userId` in path.

| Method | Path | Maps to Phase 1 idea |
|---|---|---|
| `GET` | `/api/books` | `listHomeBooks` (shared catalog) |
| `POST` | `/api/books` | create catalog after Storage upload |
| `GET` | `/api/books/:bookId` | `getBookById` |
| `GET` | `/api/library?shelf=mine\|favorite\|want\|finished` | My Library lists |
| `POST` | `/api/library/:bookId` | `addToMyBooks` |
| `DELETE` | `/api/library/:bookId` | `removeFromMyBooks` |
| `PUT` | `/api/library/:bookId/favorite` | `setBookFavorite` |
| `PUT` | `/api/library/:bookId/rating` | `setBookRating` |
| `PUT` | `/api/library/:bookId/status` | `setBookStatus` |
| `PATCH` | `/api/library/:bookId/progress` | `updateReadingProgress` |

No `DELETE /api/books/:id` in product scope.

### Reader hook

```ts
onProgress?: (p: {
  lastReadPage: number;
  totalPages: number;
  progressPercent: number;
  locator: ReadingLocator;
}) => void;
```

Reader → parent → `updateReadingProgress` (personal; not shown on Home).

---

## Implementation

### UI (cards)

**Home**
```
[ COVER — A4 ]
Title
★★★★☆          (read-only avg)
⋯ menu
```

**My Library (My Books / Favorite / …)**
```
[ COVER — A4 ]
Title
92% ████░░  ⋯
★★★★☆          (interactive)
```

### Phase 1 steps

1. Extend `LibraryBook` + IndexedDB (rating, progress, locator, coverImage)
2. Shared `BookCard` + `StarRating`
3. Open from Home → `inMyLibrary = true` → reader
4. My Books `⋯`: Favorite, Want to Read, Delete
5. Home `⋯`: Add / Favorite / Want to Read; **no progress bar**
6. Reader emits progress; debounce save; resume on reopen
7. Upload lands on Home until opened
8. Rename storage APIs to match this doc (when approved)

### Phase 2 steps (later)

1. Provision Firestore + Storage
2. Upload → Storage + `books` doc (Home catalog)
3. User state → `users/{uid}/books/{bookId}`
4. Keep IndexedDB as cache
5. Still no user-facing delete from Home

### Success

- Upload → Home  
- Open → My Books + progress updates **there**  
- Home never shows personal progress  
- Favorite works  
- Delete removes from My Books, **not** Home  
- Stars persist after refresh  

---

*Document version 1.3 — Home rename + no progress on Home.*
