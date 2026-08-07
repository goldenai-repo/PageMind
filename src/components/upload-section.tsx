"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Upload } from "lucide-react";

import { BookReader } from "@/components/book-reader";
import { BookCard } from "@/components/book-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COVERS,
  formatSize,
  type BookExt,
  type LibraryBook,
} from "@/lib/books";
import { extractCoverImage } from "@/lib/cover";
import { deleteBook, loadBooks, saveBook } from "@/lib/storage";
import { cn } from "@/lib/utils";

function hasFiles(e: DragEvent | React.DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

async function backfillCovers(
  userId: string,
  books: LibraryBook[],
  setBooks: React.Dispatch<React.SetStateAction<LibraryBook[]>>,
) {
  for (const book of books) {
    if (book.coverImage) continue;
    const coverImage = await extractCoverImage(book.data, book.ext, {
      title: book.title,
    });
    if (!coverImage) continue;
    const updated = { ...book, coverImage };
    setBooks((prev) => prev.map((b) => (b.id === book.id ? updated : b)));
    void saveBook(userId, updated);
  }
}

type SortKey = "recent" | "title";

export function UploadSection({ userId }: { userId: string }) {
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [currentBook, setCurrentBook] = useState<LibraryBook | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const booksRef = useRef(books);

  useEffect(() => {
    booksRef.current = books;
  }, [books]);

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

  useEffect(() => {
    let cancelled = false;
    loadBooks(userId)
      .then((loaded) => {
        if (cancelled) return;
        setBooks(loaded);
        void backfillCovers(userId, loaded, setBooks);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [userId]);
  const [dragActive, setDragActive] = useState(false);
  const [zoneActive, setZoneActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["pdf", "epub", "txt"].includes(ext)) {
        alert(
          `Unsupported format: .${ext}\nPageMind supports PDF, EPUB, and TXT.`,
        );
        return;
      }

      const pushBook = async (data: LibraryBook["data"]) => {
        const bookExt = ext as BookExt;
        const coverImage = await extractCoverImage(
          bookExt === "epub" ? file : data,
          bookExt,
          { title: file.name.replace(/\.[^/.]+$/, "") },
        );
        const book: LibraryBook = {
          id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
          title: file.name.replace(/\.[^/.]+$/, ""),
          ext: bookExt,
          data,
          cover: COVERS[booksRef.current.length % COVERS.length],
          coverImage: coverImage ?? null,
          size: formatSize(file.size),
          addedAt: new Date(),
        };
        setBooks((prev) => [...prev, book]);
        void saveBook(userId, book);
      };

      // EPUB: keep the raw File — JSZip reads it at open time (legacy behavior).
      if (ext === "epub") {
        void pushBook(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result != null) {
          void pushBook(ev.target.result as string | ArrayBuffer);
        }
      };
      if (ext === "txt") reader.readAsText(file);
      else reader.readAsArrayBuffer(file);
    },
    [userId],
  );

  const onFiles = useCallback(
    (list: FileList | File[]) => {
      Array.from(list).forEach(processFile);
    },
    [processFile],
  );

  const openBook = (book: LibraryBook) => {
    dragDepth.current = 0;
    setDragActive(false);
    setZoneActive(false);
    const updated: LibraryBook = {
      ...book,
      inMyLibrary: true,
      lastOpenedAt: new Date(),
    };
    setBooks((prev) => prev.map((b) => (b.id === book.id ? updated : b)));
    void saveBook(userId, updated);
    setCurrentBook(updated);
  };

  /** Temporary: permanently remove upload from IndexedDB (dev/test helper). */
  const removeUploadedBook = (book: LibraryBook) => {
    setMenuOpenId(null);
    setBooks((prev) => prev.filter((b) => b.id !== book.id));
    if (currentBook?.id === book.id) setCurrentBook(null);
    void deleteBook(userId, book.id);
  };

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
        <p className="text-[1.35rem] font-semibold">Drop to add to your library</p>
        <p className="text-[0.88rem] opacity-70">PDF · EPUB · TXT</p>
      </div>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.85rem] text-muted-foreground">
            {books.length === 0
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

      {books.length === 0 ? (
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
            browse files.
          </p>
          <Button
            type="button"
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
              onOpen={() => openBook(book)}
              menuOpen={menuOpenId === book.id}
              onMenuOpenChange={(open) =>
                setMenuOpenId(open ? book.id : null)
              }
              menuItems={[
                {
                  label: "Delete upload",
                  danger: true,
                  onSelect: () => removeUploadedBook(book),
                },
              ]}
            />
          ))}
        </div>
      )}

      {currentBook ? (
        <BookReader
          book={currentBook}
          onClose={() => setCurrentBook(null)}
          onProgress={(progress) => {
            setBooks((prev) => {
              const current = prev.find((b) => b.id === currentBook.id);
              if (!current) return prev;
              const updated: LibraryBook = {
                ...current,
                inMyLibrary: true,
                lastReadPage: progress.lastReadPage,
                totalPages: progress.totalPages,
                progressPercent: progress.progressPercent,
                locator: progress.locator,
                lastOpenedAt: new Date(),
                ...(progress.progressPercent >= 100
                  ? { status: "finished" as const }
                  : {}),
              };
              void saveBook(userId, updated);
              return prev.map((b) => (b.id === current.id ? updated : b));
            });
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
          }}
        />
      ) : null}
    </>
  );
}
