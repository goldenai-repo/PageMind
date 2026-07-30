"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  BookmarkCheck,
  BookOpen,
  Plus,
  Search,
  Upload,
} from "lucide-react";

import { BookReader } from "@/components/book-reader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatDate,
  isBookExt,
  type BookMeta,
  type LibraryBook,
  type ShelfEntry,
} from "@/lib/books";
import {
  fetchLibrary,
  fetchShelf,
  loadBookData,
  migrateLocalBooks,
  updateShelfEntry,
  uploadBook,
} from "@/lib/library-api";
import { cn } from "@/lib/utils";

function hasFiles(e: DragEvent | React.DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

type SortKey = "recent" | "title";
type Tab = "library" | "shelf";

/** When a shelf book was last touched — for recency sorting. */
function shelfTime(entry: ShelfEntry | undefined) {
  if (!entry) return 0;
  return new Date(entry.lastReadAt ?? entry.updatedAt).getTime();
}

export function LibrarySection() {
  const [tab, setTab] = useState<Tab>("library");
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [shelf, setShelf] = useState<Record<string, ShelfEntry>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<LibraryBook | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [libraryBooks, shelfEntries] = await Promise.all([
          fetchLibrary(),
          fetchShelf(),
        ]);
        if (cancelled) return;
        setBooks(libraryBooks);
        setShelf(Object.fromEntries(shelfEntries.map((e) => [e.bookId, e])));
        setLoadError(null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Could not load the library.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Move books saved locally (pre-shared-library) into the shared library.
      try {
        const migrated = await migrateLocalBooks();
        if (!cancelled && migrated.length > 0) {
          setBooks((prev) => [...prev, ...migrated]);
        }
      } catch (err) {
        console.error(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shelfBooks = useMemo(
    () =>
      books.filter((b) => {
        const entry = shelf[b.id];
        return entry != null && (entry.archived || entry.lastReadAt != null);
      }),
    [books, shelf],
  );

  const sourceBooks = tab === "library" ? books : shelfBooks;

  const visibleBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? sourceBooks.filter((b) => b.title.toLowerCase().includes(q))
      : sourceBooks;
    if (tab === "shelf") {
      return [...filtered].sort((a, b) => shelfTime(shelf[b.id]) - shelfTime(shelf[a.id]));
    }
    return [...filtered].sort((a, b) =>
      sortKey === "title"
        ? a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        : b.addedAt.getTime() - a.addedAt.getTime(),
    );
  }, [sourceBooks, query, sortKey, tab, shelf]);

  const [dragActive, setDragActive] = useState(false);
  const [zoneActive, setZoneActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !isBookExt(ext)) {
      alert(
        `Unsupported format: .${ext}\nPageMind supports PDF, EPUB, and TXT.`,
      );
      return;
    }

    setUploadingCount((n) => n + 1);
    uploadBook(file)
      .then((meta) => setBooks((prev) => [...prev, meta]))
      .catch((err: unknown) => {
        alert(
          `Could not upload "${file.name}".\n${err instanceof Error ? err.message : ""}`,
        );
      })
      .finally(() => setUploadingCount((n) => n - 1));
  }, []);

  const onFiles = useCallback(
    (list: FileList | File[]) => {
      Array.from(list).forEach(processFile);
    },
    [processFile],
  );

  const openBook = useCallback(async (meta: BookMeta) => {
    dragDepth.current = 0;
    setDragActive(false);
    setZoneActive(false);
    setOpeningId(meta.id);
    try {
      const book = await loadBookData(meta);
      const now = new Date().toISOString();
      setShelf((prev) => ({
        ...prev,
        [meta.id]: {
          bookId: meta.id,
          archived: prev[meta.id]?.archived ?? false,
          lastReadAt: now,
          updatedAt: now,
        },
      }));
      updateShelfEntry(meta.id, { markRead: true })
        .then((entry) => setShelf((prev) => ({ ...prev, [meta.id]: entry })))
        .catch(console.error);
      setCurrentBook(book);
    } catch (err) {
      alert(
        `Could not open "${meta.title}".\n${err instanceof Error ? err.message : ""}`,
      );
    } finally {
      setOpeningId(null);
    }
  }, []);

  const toggleArchived = useCallback(
    (meta: BookMeta) => {
      const previous = shelf[meta.id];
      const archived = !(previous?.archived ?? false);
      const now = new Date().toISOString();
      setShelf((prev) => ({
        ...prev,
        [meta.id]: {
          bookId: meta.id,
          archived,
          lastReadAt: previous?.lastReadAt ?? null,
          updatedAt: now,
        },
      }));
      updateShelfEntry(meta.id, { archived })
        .then((entry) => setShelf((prev) => ({ ...prev, [meta.id]: entry })))
        .catch((err: unknown) => {
          console.error(err);
          setShelf((prev) => {
            const next = { ...prev };
            if (previous) next[meta.id] = previous;
            else delete next[meta.id];
            return next;
          });
        });
    },
    [shelf],
  );

  useEffect(() => {
    // Skip window DnD while the reader is open.
    if (currentBook) return;

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current += 1;
      setDragActive(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragActive(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragActive(false);
      if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles, currentBook]);

  const zoneHandlers = {
    onDragEnter: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      setZoneActive(true);
    },
    onDragOver: (e: React.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setZoneActive(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setZoneActive(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setZoneActive(false);
      setDragActive(false);
      dragDepth.current = 0;
      if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
    },
  };

  const subtitle = loading
    ? "Loading…"
    : tab === "library"
      ? books.length === 0
        ? "No books yet"
        : query.trim()
          ? `${visibleBooks.length} of ${books.length} ${books.length === 1 ? "book" : "books"} match`
          : books.length === 1
            ? "1 book in the shared library"
            : `${books.length} books in the shared library`
      : shelfBooks.length === 0
        ? "Nothing on your shelf yet"
        : query.trim()
          ? `${visibleBooks.length} of ${shelfBooks.length} ${shelfBooks.length === 1 ? "book" : "books"} match`
          : shelfBooks.length === 1
            ? "1 book on your shelf"
            : `${shelfBooks.length} books on your shelf`;

  return (
    <>
      {/* Full-window overlay — only while dragging files over the page */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[900] flex flex-col items-center justify-center gap-3 bg-navy/80 text-white opacity-0 backdrop-blur-sm transition-opacity duration-150",
          dragActive && "opacity-100",
        )}
        aria-hidden={!dragActive}
      >
        <Upload className="size-12 opacity-90" />
        <p className="text-[1.35rem] font-semibold">Drop to add to the library</p>
        <p className="text-[0.88rem] opacity-70">PDF · EPUB · TXT</p>
      </div>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div
            className="flex w-fit items-center gap-1 rounded-lg border border-border bg-white/70 p-1"
            role="tablist"
            aria-label="Book views"
          >
            {(
              [
                ["library", "Library"],
                ["shelf", "My Shelf"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "rounded-md px-4 py-1.5 text-[0.95rem] font-semibold transition-colors",
                  tab === key
                    ? "bg-navy text-white shadow-sm"
                    : "text-muted-foreground hover:text-navy",
                )}
              >
                {label}
                {key === "shelf" && shelfBooks.length > 0 ? (
                  <span
                    className={cn(
                      "ml-1.5 rounded-full px-1.5 py-0.5 text-[0.68rem] font-bold tabular-nums",
                      tab === "shelf"
                        ? "bg-white/20 text-white"
                        : "bg-navy/10 text-navy",
                    )}
                  >
                    {shelfBooks.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.85rem] text-muted-foreground">
            {uploadingCount > 0
              ? `Uploading ${uploadingCount} ${uploadingCount === 1 ? "book" : "books"}…`
              : subtitle}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="h-[42px] rounded-[6px] px-5 font-semibold shadow-[0_3px_12px_rgba(27,54,93,0.3)] hover:-translate-y-px"
        >
          <Plus className="size-4" />
          Upload Book
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.epub,.txt"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {sourceBooks.length > 0 ? (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search books…"
              aria-label="Search books by title"
              className="h-10 rounded-[6px] bg-white pl-9"
            />
          </div>
          {tab === "library" ? (
            <div className="ml-auto flex items-center gap-2">
              <label
                htmlFor="library-sort"
                className="text-[0.8rem] text-muted-foreground"
              >
                Sort by
              </label>
              <select
                id="library-sort"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-10 rounded-[6px] border border-input bg-white px-3 text-[0.85rem] font-medium text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="recent">Recently added</option>
                <option value="title">Title A–Z</option>
              </select>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/60 px-4 py-20">
          <div className="size-8 animate-spin rounded-full border-2 border-navy/20 border-t-navy" />
          <p className="text-sm text-muted-foreground">Loading library…</p>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-white/60 px-4 py-14 text-center">
          <p className="text-[0.95rem] font-semibold text-foreground">
            Could not load the library
          </p>
          <p className="max-w-96 text-[0.85rem] text-muted-foreground">
            {loadError}
          </p>
        </div>
      ) : tab === "shelf" && shelfBooks.length === 0 ? (
        <div className="flex flex-col items-center gap-3.5 rounded-2xl border-2 border-dashed border-border bg-white/60 px-4 py-16 text-center">
          <div className="mb-1 flex size-16 items-center justify-center rounded-2xl bg-muted text-navy/40">
            <Bookmark className="size-8" />
          </div>
          <p className="text-[1.1rem] font-semibold text-foreground">
            Your shelf is empty
          </p>
          <p className="max-w-96 text-[0.87rem] leading-relaxed text-muted-foreground">
            Books you read show up here automatically, and you can archive any
            book from the library to keep it on your shelf.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setTab("library")}
            className="mt-2 h-10 rounded-[6px] px-6 font-semibold"
          >
            Browse the library
          </Button>
        </div>
      ) : books.length === 0 ? (
        <div
          {...zoneHandlers}
          className={cn(
            "flex flex-col items-center gap-3.5 rounded-2xl border-2 border-dashed px-4 py-16 text-center transition-colors",
            zoneActive || dragActive
              ? "border-navy bg-navy/5"
              : "border-border bg-white/60",
          )}
        >
          <div
            className={cn(
              "mb-1 flex size-16 items-center justify-center rounded-2xl transition-colors",
              zoneActive || dragActive ? "bg-navy/10 text-navy" : "bg-muted text-navy/40",
            )}
          >
            <Upload className="size-8" />
          </div>
          <p className="text-[1.1rem] font-semibold text-foreground">
            Drag & drop books here
          </p>
          <p className="max-w-80 text-[0.87rem] leading-relaxed text-muted-foreground">
            Drop a PDF, EPUB, or TXT anywhere on this page — or click below to
            browse files. Books you add are shared with every reader.
          </p>
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 h-10 rounded-[6px] px-6 font-semibold shadow-[0_3px_12px_rgba(27,54,93,0.28)]"
          >
            Upload the first book
          </Button>
        </div>
      ) : visibleBooks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-border bg-white/60 px-4 py-14 text-center">
          <p className="text-[0.95rem] font-semibold text-foreground">
            No books match “{query.trim()}”
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setQuery("")}
            className="rounded-[6px]"
          >
            Clear search
          </Button>
        </div>
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-6"
          role="list"
          aria-label={tab === "library" ? "Book collection" : "Shelf books"}
        >
          {visibleBooks.map((book) => {
            const entry = shelf[book.id];
            const archived = entry?.archived ?? false;
            const opening = openingId === book.id;
            return (
              <div
                key={book.id}
                role="listitem"
                className="group relative flex flex-col overflow-hidden rounded-xl bg-card shadow-[0_2px_10px_rgba(27,54,93,0.07)] transition-all hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(27,54,93,0.15)]"
              >
                <button
                  type="button"
                  aria-label={`${book.title} — ${book.ext.toUpperCase()}`}
                  onClick={() => void openBook(book)}
                  disabled={opening}
                  className="flex flex-1 flex-col text-left outline-none focus-visible:ring-3 focus-visible:ring-navy/25"
                >
                  <div
                    className="relative flex h-[210px] shrink-0 items-center justify-center self-stretch overflow-hidden"
                    style={{ background: book.cover }}
                  >
                    <div className="absolute inset-y-0 left-0 w-[13px] border-r border-white/10 bg-black/20" />
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_55%)]" />
                    {opening ? (
                      <div className="size-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    ) : (
                      <BookOpen className="size-10 text-white opacity-40" />
                    )}
                    <span className="absolute right-2.5 bottom-2.5 rounded bg-black/30 px-1.5 py-0.5 text-[0.63rem] font-bold tracking-wider text-white/90 backdrop-blur-sm">
                      {book.ext.toUpperCase()}
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col gap-1 px-3.5 pt-3 pb-3.5">
                    <p
                      className="line-clamp-2 text-[0.875rem] leading-snug font-semibold text-foreground"
                      title={book.title}
                    >
                      {book.title}
                    </p>
                    <p className="truncate text-[0.72rem] text-muted-foreground">
                      {tab === "shelf" && entry?.lastReadAt
                        ? `Read ${formatDate(new Date(entry.lastReadAt))}`
                        : `${book.size} · ${formatDate(book.addedAt)}`}
                    </p>
                  </div>
                </button>
                <button
                  type="button"
                  aria-pressed={archived}
                  aria-label={
                    archived
                      ? `Remove ${book.title} from your shelf`
                      : `Archive ${book.title} to your shelf`
                  }
                  title={archived ? "On your shelf — click to remove" : "Archive to my shelf"}
                  onClick={() => toggleArchived(book)}
                  className={cn(
                    "absolute top-2 right-2 flex size-8 items-center justify-center rounded-lg backdrop-blur-sm transition-all outline-none focus-visible:ring-3 focus-visible:ring-white/60",
                    archived
                      ? "bg-white/90 text-navy shadow-sm"
                      : "bg-black/25 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/40",
                  )}
                >
                  {archived ? (
                    <BookmarkCheck className="size-4" />
                  ) : (
                    <Bookmark className="size-4" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {currentBook ? (
        <BookReader book={currentBook} onClose={() => setCurrentBook(null)} />
      ) : null}
    </>
  );
}
