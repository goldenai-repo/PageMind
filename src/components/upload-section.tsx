"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Upload } from "lucide-react";

import { BookReader } from "@/components/book-reader";
import { BookCard } from "@/components/book-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LibraryBook } from "@/lib/books";
import {
  applyShelfEntry,
  coverImageForBook,
  enrichEpubPdfCovers,
  fetchLibraryBooks,
  mergeMetaWithShelf,
  openLibraryBook,
  updateShelfEntry,
  uploadBook,
} from "@/lib/library-api";
import { cn } from "@/lib/utils";
import { saveCachedCover } from "@/lib/storage";

function hasFiles(e: DragEvent | React.DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

type SortKey = "recent" | "title";

export function UploadSection({ userId }: { userId: string }) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [currentBook, setCurrentBook] = useState<LibraryBook | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const loaded = await fetchLibraryBooks();
    setBooks(loaded);
  }, []);

  // Load catalog from Firestore (files live in Storage / legacy chunks).
  useEffect(() => {
    let cancelled = false;
    const signal = { cancelled: false };
    void (async () => {
      try {
        const loaded = await fetchLibraryBooks();
        if (cancelled) return;
        setBooks(loaded);
        void enrichEpubPdfCovers(
          loaded,
          (bookId, coverImage) => {
            if (signal.cancelled) return;
            setBooks((prev) =>
              prev.map((b) =>
                b.id === bookId && !b.coverImage ? { ...b, coverImage } : b,
              ),
            );
          },
          signal,
        );
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      signal.cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!menuOpenId) return;
    const close = () => setMenuOpenId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menuOpenId]);

  const visibleBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? books.filter((b) => b.title.toLowerCase().includes(q))
      : books;
    return [...filtered].sort((a, b) =>
      sortKey === "title"
        ? a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        : b.addedAt.getTime() - a.addedAt.getTime(),
    );
  }, [books, query, sortKey]);

  const [dragActive, setDragActive] = useState(false);
  const [zoneActive, setZoneActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["pdf", "epub", "txt"].includes(ext)) {
      alert(
        `Unsupported format: .${ext}\nPageMind supports PDF, EPUB, and TXT.`,
      );
      return;
    }

    try {
      const meta = await uploadBook(file);
      const coverImage = await coverImageForBook(
        { title: meta.title, ext: meta.ext, data: new ArrayBuffer(0) },
        file,
      );
      const book = {
        ...mergeMetaWithShelf(meta),
        coverImage: coverImage ?? undefined,
      };
      if (coverImage) {
        void saveCachedCover(book.id, coverImage).catch(console.error);
      }
      setBooks((prev) => {
        if (prev.some((b) => b.id === book.id)) return prev;
        return [...prev, book];
      });
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Upload failed.");
    }
  }, []);

  const onFiles = useCallback(
    async (list: FileList | File[]) => {
      setUploading(true);
      try {
        for (const file of Array.from(list)) {
          await processFile(file);
        }
      } finally {
        setUploading(false);
      }
    },
    [processFile],
  );

  const openBook = async (book: LibraryBook) => {
    dragDepth.current = 0;
    setDragActive(false);
    setZoneActive(false);
    try {
      const opened = await openLibraryBook(book);
      setBooks((prev) =>
        prev.map((b) =>
          b.id === book.id
            ? {
                ...b,
                inMyLibrary: true,
                lastOpenedAt: opened.lastOpenedAt,
                coverImage: opened.coverImage ?? b.coverImage,
              }
            : b,
        ),
      );
      setCurrentBook(opened);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : "Could not open this book.");
    }
  };

  /** Temporary: permanently remove catalog book + Storage object. */
  const removeUploadedBook = async (book: LibraryBook) => {
    setMenuOpenId(null);
    setBooks((prev) => prev.filter((b) => b.id !== book.id));
    if (currentBook?.id === book.id) setCurrentBook(null);
    try {
      const res = await fetch(`/api/books/${book.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Delete failed.");
      }
    } catch (err) {
      console.error(err);
      await reload().catch(console.error);
      alert(err instanceof Error ? err.message : "Delete failed.");
    }
  };

  useEffect(() => {
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
      if (e.dataTransfer?.files?.length) void onFiles(e.dataTransfer.files);
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
      if (e.dataTransfer.files?.length) void onFiles(e.dataTransfer.files);
    },
  };

  return (
    <>
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[900] flex flex-col items-center justify-center gap-3 bg-navy/80 text-white opacity-0 backdrop-blur-sm transition-opacity duration-150",
          dragActive && "opacity-100",
        )}
        aria-hidden={!dragActive}
      >
        <Upload className="size-12 opacity-90" />
        <p className="text-[1.35rem] font-semibold">Drop to add to your library</p>
        <p className="text-[0.88rem] opacity-70">PDF · EPUB · TXT</p>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.85rem] text-muted-foreground">
            {loading
              ? "Loading…"
              : uploading
                ? "Uploading…"
                : books.length === 0
                  ? "No books yet — drop files below"
                  : query.trim()
                    ? `${visibleBooks.length} of ${books.length} ${books.length === 1 ? "book" : "books"} match`
                    : books.length === 1
                      ? "1 book in your collection"
                      : `${books.length} books in your collection`}
          </p>
        </div>
        <Button
          type="button"
          disabled={uploading}
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
            if (e.target.files?.length) void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {books.length > 0 ? (
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
        </div>
      ) : null}

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <div className="size-8 animate-spin rounded-full border-2 border-navy/20 border-t-navy" />
          <p className="text-sm text-muted-foreground">Loading library…</p>
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
            browse files. Files are stored in Firebase Storage.
          </p>
          <Button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-2 h-10 rounded-[6px] px-6 font-semibold shadow-[0_3px_12px_rgba(27,54,93,0.28)]"
          >
            Upload your first book
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
          className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-x-5 gap-y-8 sm:grid-cols-[repeat(auto-fill,minmax(156px,1fr))]"
          role="list"
          aria-label="Book collection"
        >
          {visibleBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              onOpen={() => void openBook(book)}
              showRating
              menuOpen={menuOpenId === book.id}
              onMenuOpenChange={(open) =>
                setMenuOpenId(open ? book.id : null)
              }
              menuItems={[
                {
                  label: "Delete upload",
                  danger: true,
                  onSelect: () => void removeUploadedBook(book),
                },
              ]}
            />
          ))}
        </div>
      )}

      {currentBook ? (
        <BookReader
          book={currentBook}
          userId={userId}
          onClose={() => setCurrentBook(null)}
          onProgress={(progress) => {
            setBooks((prev) =>
              prev.map((b) =>
                b.id === currentBook.id
                  ? {
                      ...b,
                      inMyLibrary: true,
                      lastReadPage: progress.lastReadPage,
                      totalPages: progress.totalPages,
                      progressPercent: progress.progressPercent,
                      locator: progress.locator,
                      lastOpenedAt: new Date(),
                      ...(progress.progressPercent >= 100
                        ? { status: "finished" as const }
                        : {}),
                    }
                  : b,
              ),
            );
            setCurrentBook((current) =>
              current
                ? {
                    ...current,
                    lastReadPage: progress.lastReadPage,
                    totalPages: progress.totalPages,
                    progressPercent: progress.progressPercent,
                    locator: progress.locator,
                  }
                : current,
            );
            void updateShelfEntry(currentBook.id, { progress })
              .then((entry) => {
                setBooks((prev) =>
                  prev.map((b) =>
                    b.id === currentBook.id ? applyShelfEntry(b, entry) : b,
                  ),
                );
              })
              .catch(console.error);
          }}
        />
      ) : null}
    </>
  );
}
