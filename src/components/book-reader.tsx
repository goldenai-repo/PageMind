"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  BookOpen,
  ChevronLeft,
  Columns2,
  Lightbulb,
  PanelLeft,
  ScrollText,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LibraryBook, ReadingProgressUpdate } from "@/lib/books";
import { fetchTipsForBook } from "@/lib/library-api";
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
import { TIP_TYPES, type TipCard } from "@/lib/tips";
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
  /** Debounced by the parent if needed; called on page/section changes. */
  onProgress?: (progress: ReadingProgressUpdate) => void;
};

export function BookReader({ book, onClose, onProgress }: BookReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<ReaderRendition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onProgressRef = useRef(onProgress);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const latestProgressRef = useRef<ReadingProgressUpdate | null>(null);

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

  const [tips, setTips] = useState<TipCard[]>([]);
  const [visibleTips, setVisibleTips] = useState<TipCard[]>([]);
  const [notesOpen, setNotesOpen] = useState(true);
  const [tipsLoading, setTipsLoading] = useState(true);
  // Bumped when a rendition finishes mounting, so notes recompute for page 1.
  const [readerReady, setReaderReady] = useState(0);

  const reflowable = book.ext === "txt" || book.ext === "epub";

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    let cancelled = false;
    setTipsLoading(true);
    fetchTipsForBook(book.id)
      .then((loaded) => {
        if (cancelled) return;
        setTips(loaded);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setTipsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  // Show only the notes whose anchor phrase is on the current page.
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    let cancelled = false;
    const strip = (s: string) => s.replace(/\s+/g, "");
    Promise.resolve(rendition.getContext())
      .then((ctx) => {
        if (cancelled) return;
        const haystack = strip(ctx.text);
        setVisibleTips(
          tips.filter((t) => haystack.includes(strip(t.anchor.text))),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tips, nav, readerReady]);

  // Keep the latest book payload for mount/resume without remounting when
  // progress fields update on the same id.
  const bookRef = useRef(book);
  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  const flushProgress = () => {
    const latest = latestProgressRef.current;
    if (!latest) return;
    latestProgressRef.current = null;
    onProgressRef.current?.(latest);
  };

  const scheduleProgress = (progress: ReadingProgressUpdate) => {
    latestProgressRef.current = progress;
    clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      flushProgress();
    }, 1200);
  };

  const handleNavChange = (state: ReaderNavState) => {
    setNav(state);
    const current = bookRef.current;
    if (
      state.page == null ||
      state.totalPages == null ||
      state.progressPercent == null
    ) {
      return;
    }

    let progress: ReadingProgressUpdate;
    if (current.ext === "pdf") {
      progress = {
        lastReadPage: state.page,
        totalPages: state.totalPages,
        progressPercent: state.progressPercent,
        locator: { format: "pdf", page: state.page },
      };
    } else {
      progress = {
        lastReadPage: state.page,
        totalPages: state.totalPages,
        progressPercent: state.progressPercent,
        locator: {
          format: current.ext,
          sectionIdx: state.sectionIdx ?? 0,
          page: state.page,
          mode: modeRef.current,
        },
      };
    }
    scheduleProgress(progress);
  };

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

    const mountedBook = bookRef.current;

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

    const resumeSection =
      mountedBook.locator &&
      (mountedBook.locator.format === "txt" ||
        mountedBook.locator.format === "epub")
        ? mountedBook.locator.sectionIdx
        : undefined;
    const resumePdfPage =
      mountedBook.locator?.format === "pdf"
        ? mountedBook.locator.page
        : mountedBook.ext === "pdf" && mountedBook.lastReadPage
          ? mountedBook.lastReadPage
          : undefined;

    const run = async () => {
      try {
        if (mountedBook.ext === "txt") {
          if (typeof mountedBook.data !== "string") {
            throw new Error("Invalid text file data.");
          }
          renditionRef.current = mountTxtReader({
            text: mountedBook.data,
            contentEl: content,
            fontSize: 18,
            mode: modeRef.current,
            initialSectionIdx: resumeSection,
            onNavChange: handleNavChange,
            onToc: handleToc,
            onTocActive: handleTocActive,
          });
        } else if (mountedBook.ext === "pdf") {
          if (!(mountedBook.data instanceof ArrayBuffer)) {
            throw new Error("Invalid PDF data.");
          }
          const rendition = await mountPdfReader({
            data: mountedBook.data,
            contentEl: content,
            signal: abort.signal,
            initialPage: resumePdfPage,
            onNavChange: handleNavChange,
            onToc: handleToc,
            onTocActive: handleTocActive,
          });
          if (abort.signal.aborted) {
            rendition.destroy();
            return;
          }
          renditionRef.current = rendition;
        } else if (mountedBook.ext === "epub") {
          if (!(mountedBook.data instanceof File)) {
            throw new Error("Invalid EPUB data.");
          }
          const rendition = await mountEpubReader({
            file: mountedBook.data,
            contentEl: content,
            fontSize: 18,
            mode: modeRef.current,
            initialSectionIdx: resumeSection,
            onNavChange: handleNavChange,
            onToc: handleToc,
            onTocActive: handleTocActive,
          });
          if (abort.signal.aborted) {
            rendition.destroy();
            return;
          }
          renditionRef.current = rendition;
        }
        if (!abort.signal.aborted && renditionRef.current) {
          setReaderReady((n) => n + 1);
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
      clearTimeout(progressTimerRef.current);
      flushProgress();
      renditionRef.current?.destroy();
      renditionRef.current = null;
    };
    // Remount only when switching to a different book — progress updates must
    // not tear down the reader (that caused a max-update-depth loop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

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
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            title="Smart notes"
            aria-pressed={notesOpen}
            onClick={() => setNotesOpen((v) => !v)}
            className={cn(
              "relative rounded-md border-border bg-[#f0f2f5]",
              notesOpen && "border-navy bg-navy/10 text-navy",
            )}
          >
            <Lightbulb className="size-3.5" />
            {tips.length > 0 ? (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-navy px-1 text-[0.6rem] font-bold text-white">
                {tips.length}
              </span>
            ) : null}
          </Button>
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

        <aside
          className={cn(
            "flex shrink-0 flex-col overflow-hidden border-l border-border bg-[#f5f7fb] transition-[width] duration-200",
            notesOpen ? "w-[320px]" : "w-0 border-l-0",
          )}
          aria-label="Smart notes"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-white px-3 py-3 text-[0.72rem] font-bold tracking-wider text-navy uppercase">
            <span className="px-1">Smart Notes</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close smart notes"
              onClick={() => setNotesOpen(false)}
              className="text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {tipsLoading ? (
              <p className="px-1 pt-6 text-center text-[0.8rem] text-muted-foreground">
                Loading…
              </p>
            ) : tips.length === 0 ? (
              <p className="px-1 pt-6 text-center text-[0.8rem] leading-relaxed text-muted-foreground">
                No smart notes for this book yet.
              </p>
            ) : visibleTips.length === 0 ? (
              <p className="px-1 pt-6 text-center text-[0.8rem] leading-relaxed text-muted-foreground">
                No smart notes on this page. Keep reading — they appear beside
                the passages they annotate.
              </p>
            ) : null}
            {visibleTips.map((tip) => {
              const meta = TIP_TYPES[tip.type];
              return (
                <div
                  key={tip.id}
                  className="rounded-lg border border-border bg-white p-3 shadow-[0_2px_10px_rgba(27,54,93,0.06)]"
                  style={{ borderLeft: `4px solid ${meta.color}` }}
                >
                  <span
                    className="text-[0.62rem] font-bold tracking-wider uppercase"
                    style={{ color: meta.color }}
                  >
                    {meta.icon} {meta.label}
                  </span>
                  <p className="mt-1 text-[0.9rem] leading-snug font-semibold text-foreground">
                    {tip.title}
                  </p>
                  <p className="mt-1 text-[0.82rem] leading-relaxed text-[#55617a]">
                    {tip.body}
                  </p>
                  {tip.anchor.text ? (
                    <p className="mt-2 border-l-2 border-border pl-2 text-[0.74rem] text-muted-foreground italic">
                      “{tip.anchor.text}”
                    </p>
                  ) : null}
                  {tip.references && tip.references.length > 0 ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {tip.references.map((ref, i) => (
                        <a
                          key={i}
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-[0.76rem] font-medium text-navy hover:underline"
                        >
                          📎 {ref.label}
                        </a>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
