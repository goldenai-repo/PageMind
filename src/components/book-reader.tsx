"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  ChevronLeft,
  Columns2,
  PanelLeft,
  ScrollText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LibraryBook } from "@/lib/books";
import { mountEpubReader } from "@/lib/readers/epub-engine";
import { mountPdfReader } from "@/lib/readers/pdf";
import {
  getReaderModeServerSnapshot,
  getReaderModeSnapshot,
  setReaderMode,
  subscribeReaderMode,
  type ReaderMode,
} from "@/lib/readers/reader-mode";
import { mountTxtReader } from "@/lib/readers/txt";
import type {
  ReaderNavState,
  ReaderRendition,
  ReaderTocItem,
} from "@/lib/readers/types";
import { cn } from "@/lib/utils";

const READER_MODE_OPTIONS: {
  value: ReaderMode;
  label: string;
  icon: typeof BookOpen;
}[] = [
  { value: "flip", label: "Single page", icon: BookOpen },
  { value: "scroll", label: "Continuous scroll", icon: ScrollText },
  { value: "spread", label: "Two-page spread", icon: Columns2 },
];

type BookReaderProps = {
  book: LibraryBook;
  onClose: () => void;
};

export function BookReader({ book, onClose }: BookReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<ReaderRendition | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [fontSize, setFontSize] = useState(18);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState<ReaderTocItem[]>([]);
  const [activeTocId, setActiveTocId] = useState<string | null>(null);
  // Persisted reader mode via an external store: SSR-safe (no hydration
  // mismatch) and no setState-in-effect.
  const mode = useSyncExternalStore(
    subscribeReaderMode,
    getReaderModeSnapshot,
    getReaderModeServerSnapshot,
  );
  const modeRef = useRef<ReaderMode>(mode);
  const [nav, setNav] = useState<ReaderNavState>({
    canPrev: false,
    canNext: false,
    pageLabel: "",
  });

  const reflowable = book.ext === "txt" || book.ext === "epub";

  // Keep the ref current and apply mode changes to the live reader. Declared
  // before the engine-mount effect so the reader mounts in the saved mode.
  useEffect(() => {
    modeRef.current = mode;
    void renditionRef.current?.setMode?.(mode);
  }, [mode]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") void renditionRef.current?.prev();
      else if (e.key === "ArrowRight") void renditionRef.current?.next();
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
    setToc([]);
    setActiveTocId(null);
    setTocOpen(false);
    setFontSize(18);
    setNav({ canPrev: false, canNext: false, pageLabel: "" });
    content.innerHTML = "";
    content.classList.remove("is-epub");

    const handleToc = (items: ReaderTocItem[]) => {
      if (abort.signal.aborted) return;
      setToc(items);
      setTocOpen(items.length > 0);
    };
    const handleTocActive = (id: string | null) => {
      if (abort.signal.aborted) return;
      setActiveTocId(id);
    };

    const run = async () => {
      try {
        if (book.ext === "txt") {
          if (typeof book.data !== "string") {
            throw new Error("Invalid text file data.");
          }
          renditionRef.current = mountTxtReader({
            text: book.data,
            contentEl: content,
            fontSize: 18,
            mode: modeRef.current,
            onNavChange: setNav,
            onToc: handleToc,
            onTocActive: handleTocActive,
          });
        } else if (book.ext === "pdf") {
          if (!(book.data instanceof ArrayBuffer)) {
            throw new Error("Invalid PDF data.");
          }
          const rendition = await mountPdfReader({
            data: book.data,
            contentEl: content,
            signal: abort.signal,
            onNavChange: setNav,
            onToc: handleToc,
            onTocActive: handleTocActive,
          });
          if (abort.signal.aborted) {
            rendition.destroy();
            return;
          }
          renditionRef.current = rendition;
        } else if (book.ext === "epub") {
          if (!(book.data instanceof File)) {
            throw new Error("Invalid EPUB data.");
          }
          const rendition = await mountEpubReader({
            file: book.data,
            contentEl: content,
            fontSize: 18,
            mode: modeRef.current,
            onNavChange: setNav,
            onToc: handleToc,
            onTocActive: handleTocActive,
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
    if (book.ext === "pdf") return;
    renditionRef.current?.themes.fontSize(`${fontSize}px`);
  }, [fontSize, book.ext]);

  // Keep the active sidebar entry in view as the reader moves.
  useEffect(() => {
    if (!activeTocId) return;
    document
      .querySelector(`[data-toc-id="${CSS.escape(activeTocId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeTocId]);

  const adjustFont = (delta: number) => {
    setFontSize((n) => Math.min(32, Math.max(12, n + delta)));
  };

  const changeMode = (next: ReaderMode) => {
    if (next === mode) return;
    // Updates the store → re-render → the [mode] effect applies it.
    setReaderMode(next);
  };

  const hasToc = toc.length > 0;

  return (
    <div
      className="fixed inset-0 z-[1000] flex flex-col bg-[#eef0f4]"
      role="dialog"
      aria-modal="true"
      aria-label="Book reader"
    >
      <header className="flex h-[60px] shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 shadow-[0_1px_6px_rgba(0,0,0,0.06)] sm:px-7">
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-9 gap-1.5 px-2 text-[0.87rem] font-medium text-navy hover:bg-navy/5 hover:text-navy"
          >
            <ChevronLeft className="size-4" />
            <span className="hidden sm:inline">My Library</span>
          </Button>
        </div>

        <div className="min-w-0 flex-1 text-center">
          <span className="block truncate text-[0.92rem] font-semibold text-foreground">
            {book.title}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {reflowable && (
            <div className="mr-1 flex items-center gap-0.5 rounded-md border border-border bg-[#f0f2f5] p-0.5">
              {READER_MODE_OPTIONS.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={label}
                  aria-pressed={mode === value}
                  onClick={() => changeMode(value)}
                  className={cn(
                    "flex h-[26px] w-[30px] items-center justify-center rounded-[5px] transition-colors",
                    mode === value
                      ? "bg-white text-navy shadow-sm"
                      : "text-muted-foreground hover:text-navy",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              ))}
            </div>
          )}
          {reflowable && (
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
            tocOpen && hasToc ? "w-[272px]" : "w-0 border-r-0",
          )}
          aria-label="Table of contents"
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-border bg-white px-2 py-2.5 text-[0.72rem] font-bold tracking-wider text-navy uppercase">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Hide contents"
              aria-label="Hide contents"
              aria-pressed={tocOpen}
              onClick={() => setTocOpen(false)}
              className="rounded-md text-navy hover:bg-navy/5 hover:text-navy"
            >
              <PanelLeft className="size-4" />
            </Button>
            <span>Contents</span>
          </div>
          <ul className="toc-list m-0 flex-1 list-none overflow-y-auto p-2" role="tree">
            {toc.map((item) => (
              <li key={item.id} className="toc-item" role="none">
                <button
                  type="button"
                  role="treeitem"
                  aria-selected={activeTocId === item.id}
                  data-toc-id={item.id}
                  title={item.label}
                  onClick={() => void renditionRef.current?.goToTocItem?.(item.id)}
                  className={cn(
                    "toc-link",
                    activeTocId === item.id && "active",
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="relative flex min-w-0 flex-1 flex-col">
          {hasToc && !tocOpen ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              title="Show contents"
              aria-label="Show contents"
              aria-pressed={tocOpen}
              onClick={() => setTocOpen(true)}
              className="absolute left-2 top-2 z-10 rounded-md border-border bg-white text-navy shadow-sm hover:bg-navy/5 hover:text-navy"
            >
              <PanelLeft className="size-4" />
            </Button>
          ) : null}
          <div
            ref={contentRef}
            className={cn(
              "reader-content min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-6",
              book.ext === "pdf" && "flex items-center justify-center",
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

          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white px-4 py-3">
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
