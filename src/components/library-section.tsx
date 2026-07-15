"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, Plus, Upload } from "lucide-react";
import { toast } from "sonner";

import { BookReader } from "@/components/book-reader";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { downloadBookData, listBooks, uploadBook } from "@/lib/supabase/books";
import { formatDate, type BookExt, type LibraryBook } from "@/lib/books";
import { cn } from "@/lib/utils";

function hasFiles(e: DragEvent | React.DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

export function LibrarySection() {
  const [supabase] = useState(createClient);
  const [books, setBooks] = useState<LibraryBook[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [currentBook, setCurrentBook] = useState<LibraryBook | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [zoneActive, setZoneActive] = useState(false);
  const dragDepth = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load the shared library from Supabase on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listBooks(supabase);
        if (!cancelled) setBooks(rows);
      } catch (err) {
        if (!cancelled) {
          toast.error("Could not load your library", {
            description: err instanceof Error ? err.message : "Please refresh.",
          });
        }
      } finally {
        if (!cancelled) setLibraryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const processFile = useCallback(
    async (file: File) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["pdf", "epub", "txt"].includes(ext)) {
        toast.error(`Unsupported format: .${ext ?? "?"}`, {
          description: "PageMind supports PDF, EPUB, and TXT.",
        });
        return;
      }

      setUploadingCount((n) => n + 1);
      try {
        const title = file.name.replace(/\.[^/.]+$/, "");
        const book = await uploadBook(supabase, file, ext as BookExt, title);
        setBooks((prev) => [...prev, book]);
      } catch (err) {
        toast.error(`Could not upload "${file.name}"`, {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setUploadingCount((n) => n - 1);
      }
    },
    [supabase],
  );

  const onFiles = useCallback(
    (list: FileList | File[]) => {
      Array.from(list).forEach((file) => void processFile(file));
    },
    [processFile],
  );

  const openBook = useCallback(
    async (book: LibraryBook) => {
      setOpeningId(book.id);
      try {
        const data = await downloadBookData(supabase, book);
        setCurrentBook({ ...book, data });
      } catch (err) {
        toast.error(`Could not open "${book.title}"`, {
          description: err instanceof Error ? err.message : "Please try again.",
        });
      } finally {
        setOpeningId(null);
      }
    },
    [supabase],
  );

  useEffect(() => {
    // Skip window DnD while the reader is open. `dragActive` itself is left
    // alone here (see its render usage below, gated on `!currentBook`) —
    // calling setState synchronously in an effect body triggers an extra
    // cascading render, which react-hooks/set-state-in-effect flags.
    if (currentBook) {
      dragDepth.current = 0;
      return;
    }

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
          dragActive && !currentBook && "opacity-100",
        )}
        aria-hidden={!dragActive || !!currentBook}
      >
        <Upload className="size-12 opacity-90" />
        <p className="text-[1.35rem] font-semibold">Drop to add to your library</p>
        <p className="text-[0.88rem] opacity-70">PDF · EPUB · TXT</p>
      </div>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.55rem] font-bold tracking-tight text-navy">
            My Library
          </h1>
          <p className="mt-0.5 text-[0.85rem] text-muted-foreground">
            {libraryLoading
              ? "Loading your library…"
              : books.length === 0
                ? "No books yet"
                : books.length === 1
                  ? "1 book in your collection"
                  : `${books.length} books in your collection`}
            {uploadingCount > 0
              ? ` · Uploading ${uploadingCount === 1 ? "1 file" : `${uploadingCount} files`}…`
              : null}
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

      {libraryLoading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-navy/40" />
          <p className="text-[0.87rem]">Loading your library…</p>
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
      ) : (
        <div
          className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-6"
          role="list"
          aria-label="Book collection"
        >
          {books.map((book) => (
            <button
              key={book.id}
              type="button"
              role="listitem"
              aria-label={`${book.title} — ${book.ext.toUpperCase()}`}
              onClick={() => void openBook(book)}
              disabled={openingId !== null}
              className="group flex flex-col overflow-hidden rounded-xl bg-card text-left shadow-[0_2px_10px_rgba(27,54,93,0.07)] outline-none transition-all hover:-translate-y-1.5 hover:shadow-[0_12px_30px_rgba(27,54,93,0.15)] focus-visible:ring-3 focus-visible:ring-navy/25 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-[0_2px_10px_rgba(27,54,93,0.07)]"
            >
              <div
                className="relative flex h-[210px] shrink-0 items-center justify-center overflow-hidden"
                style={{ background: book.cover }}
              >
                <div className="absolute inset-y-0 left-0 w-[13px] border-r border-white/10 bg-black/20" />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.14)_0%,transparent_55%)]" />
                {openingId === book.id ? (
                  <Loader2 className="size-10 animate-spin text-white/80" />
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
                  {book.size} · {formatDate(book.addedAt)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {currentBook ? (
        <BookReader
          key={currentBook.id}
          book={currentBook}
          onClose={() => setCurrentBook(null)}
        />
      ) : null}
    </>
  );
}
