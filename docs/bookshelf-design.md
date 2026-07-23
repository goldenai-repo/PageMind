# Design Doc - PageMind Bookshelf (收藏 · 进度 · 评分)

**Author:** Coco  
**Version:** 1.1  
**Date:** 2026-07-22  
**Branch:** `feat/user-library`

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

### Phase 1 — local module API (`src/lib/storage.ts`)

| API | Behavior |
|---|---|
| `loadBooks(userId)` | List all uploads (All Books) |
| `saveBook(userId, book)` | Upsert full record |
| `setLibraryMembership(userId, bookId, inLibrary)` | Add/remove My Books (**Delete** = `false`) |
| `setFavorite(userId, bookId, favorite)` | Toggle favorite |
| `setRating(userId, bookId, rating)` | Set 0–5 |
| `updateProgress(userId, bookId, progress)` | Save page / % / locator |

No catalog delete API.

### Phase 2 — HTTP (future)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/books` | All Books |
| `POST` | `/api/books` | Create after Storage upload |
| `GET` | `/api/library?shelf=` | My Library shelves |
| `PUT` | `/api/library/:bookId` | favorite / inLibrary / rating |
| `DELETE` | `/api/library/:bookId` | Remove from My Books only |
| `PATCH` | `/api/library/:bookId/progress` | Progress update |

### Reader hook

```ts
onProgress?: (p: {
  lastReadPage: number;
  totalPages: number;
  progressPercent: number;
  locator: ReadingLocator;
}) => void;
```

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
