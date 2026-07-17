"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, List, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LibraryBook } from "@/lib/books";
import {
  mountEpubReader,
  type EpubNavState,
  type EpubRendition,
} from "@/lib/readers/epub-engine";
import { renderPdfPages } from "@/lib/readers/pdf";
import { cn } from "@/lib/utils";

type BookReaderProps = {
  book: LibraryBook;
  onClose: () => void;
};

export function BookReader({ book, onClose }: BookReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const tocListRef = useRef<HTMLUListElement>(null);
  const renditionRef = useRef<EpubRendition | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [fontSize, setFontSize] = useState(18);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [showEpubChrome, setShowEpubChrome] = useState(false);
  const [hasToc, setHasToc] = useState(false);
  const [nav, setNav] = useState<EpubNavState>({
    canPrev: false,
    canNext: false,
    pageLabel: "",
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    renditionRef.current?.destroy();
    renditionRef.current = null;

    setLoading(true);
    setError(null);
    setShowEpubChrome(false);
    setHasToc(false);
    setTocOpen(false);
    setFontSize(18);
    setNav({ canPrev: false, canNext: false, pageLabel: "" });
    content.innerHTML = "";
    content.classList.remove("is-epub");

    const run = async () => {
      try {
        if (book.ext === "txt") {
          if (typeof book.data !== "string") {
            throw new Error("Invalid text file data.");
          }
          content.innerHTML = "";
          const div = document.createElement("div");
          div.className = "reader-txt";
          div.style.fontSize = "18px";
          div.textContent = book.data;
          content.appendChild(div);
        } else if (book.ext === "pdf") {
          if (!(book.data instanceof ArrayBuffer)) {
            throw new Error("Invalid PDF data.");
          }
          await renderPdfPages(book.data, content, abort.signal);
        } else if (book.ext === "epub") {
          if (!(book.data instanceof File)) {
            throw new Error("Invalid EPUB data.");
          }
          const tocList = tocListRef.current;
          if (!tocList) throw new Error("Reader controls not ready.");

          setShowEpubChrome(true);
          const rendition = await mountEpubReader({
            file: book.data,
            contentEl: content,
            tocListEl: tocList,
            fontSize: 18,
            onTocVisibility: (visible) => {
              setHasToc(visible);
              setTocOpen(visible);
            },
            onNavChange: setNav,
          });
          if (abort.signal.aborted) {
            rendition.destroy();
            return;
          }
          renditionRef.current = rendition;
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Could not open this file.",
        );
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };

    void run();

    return () => {
      abort.abort();
      renditionRef.current?.destroy();
      renditionRef.current = null;
    };
  }, [book]);

  useEffect(() => {
    if (!contentRef.current) return;
    if (book.ext === "txt") {
      const el = contentRef.current.querySelector(
        ".reader-txt",
      ) as HTMLElement | null;
      if (el) el.style.fontSize = `${fontSize}px`;
    } else if (book.ext === "epub" && renditionRef.current) {
      renditionRef.current.themes.fontSize(`${fontSize}px`);
    }
  }, [fontSize, book.ext]);

  const adjustFont = (delta: number) => {
    setFontSize((n) => Math.min(32, Math.max(12, n + delta)));
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-[#eef0f4]"
      role="dialog"
      aria-modal="true"
      aria-label="Book reader"
    >
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 shadow-[0_1px_6px_rgba(0,0,0,0.06)] sm:px-7">
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="h-9 gap-1.5 px-2 text-[0.87rem] font-medium text-navy hover:bg-navy/5 hover:text-navy"
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">My Library</span>
        </Button>

        <div className="min-w-0 flex-1 text-center">
          <span className="block truncate text-[0.92rem] font-semibold text-foreground">
            {book.title}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showEpubChrome ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              title="Toggle contents"
              onClick={() => setTocOpen((v) => !v)}
              className={cn(
                "rounded-md border-border bg-[#f0f2f5]",
                !hasToc && "invisible",
              )}
            >
              <List className="size-3.5" />
            </Button>
          ) : null}
          {(book.ext === "txt" || book.ext === "epub") && (
            <>
              <div className="mx-1 h-[18px] w-px bg-border" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => adjustFont(-2)}
                disabled={fontSize <= 12}
                className="h-[30px] min-w-[34px] rounded-md border-border bg-[#f0f2f5] px-2 text-[0.8rem] font-bold"
              >
                A−
              </Button>
              <span className="min-w-[34px] text-center text-[0.76rem] text-muted-foreground tabular-nums">
                {fontSize}px
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => adjustFont(2)}
                disabled={fontSize >= 32}
                className="h-[30px] min-w-[34px] rounded-md border-border bg-[#f0f2f5] px-2 text-[0.8rem] font-bold"
              >
                A+
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          className={cn(
            "flex shrink-0 flex-col overflow-hidden border-r border-border bg-[#f5f7fb] transition-[width] duration-200",
            showEpubChrome && tocOpen && hasToc
              ? "w-[272px]"
              : "w-0 border-r-0",
          )}
          aria-label="Table of contents"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-white px-3 py-3 text-[0.72rem] font-bold tracking-wider text-navy uppercase">
            <span className="px-1">Contents</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close contents"
              onClick={() => setTocOpen(false)}
              className="text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <ul
            ref={tocListRef}
            className="toc-list m-0 flex-1 list-none overflow-y-auto p-2"
            role="tree"
          />
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col">
          <div
            ref={contentRef}
            className={cn(
              "reader-content min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6",
              book.ext === "txt" && "flex items-start justify-center",
            )}
            tabIndex={0}
          />

          {loading ? (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#eef0f4]/90">
              <div className="size-8 animate-spin rounded-full border-2 border-navy/20 border-t-navy" />
              <p className="text-sm text-muted-foreground">Opening book…</p>
            </div>
          ) : null}

          {error ? (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="max-w-md rounded-xl bg-white p-6 text-center shadow-md">
                <p className="font-semibold text-foreground">
                  Could not open this file.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white px-4 py-3",
              !showEpubChrome && "hidden",
            )}
            aria-hidden={!showEpubChrome}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!nav.canPrev}
              onClick={() => void renditionRef.current?.prev()}
              className="rounded-md border-border text-navy"
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </Button>
            <span
              className="min-w-0 flex-1 truncate text-center text-[0.82rem] text-muted-foreground"
              aria-live="polite"
            >
              {nav.pageLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!nav.canNext}
              onClick={() => void renditionRef.current?.next()}
              className="rounded-md border-border text-navy"
            >
              Next
              <ChevronLeft className="size-3.5 rotate-180" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
