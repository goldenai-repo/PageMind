"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Lightbulb, List, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LibraryBook } from "@/lib/books";
import { fetchTipsForBook } from "@/lib/library-api";
import { mountEpubReader } from "@/lib/readers/epub-engine";
import { mountPdfReader } from "@/lib/readers/pdf";
import { mountTxtReader } from "@/lib/readers/txt";
import type { ReaderNavState, ReaderRendition } from "@/lib/readers/types";
import { TIP_TYPES, type TipCard } from "@/lib/tips";
import { cn } from "@/lib/utils";

type BookReaderProps = {
  book: LibraryBook;
  onClose: () => void;
};

export function BookReader({ book, onClose }: BookReaderProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const tocListRef = useRef<HTMLUListElement>(null);
  const renditionRef = useRef<ReaderRendition | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [fontSize, setFontSize] = useState(18);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [showEpubChrome, setShowEpubChrome] = useState(false);
  const [hasToc, setHasToc] = useState(false);
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

  useEffect(() => {
    let cancelled = false;
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

  // Show only the notes whose anchor phrase is on the current page. Recomputes
  // on every page turn (nav), when notes load, and when a book first mounts.
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
  }, [nav, tips, readerReady]);

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
          renditionRef.current = mountTxtReader({
            text: book.data,
            contentEl: content,
            fontSize: 18,
            onNavChange: setNav,
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
        if (!abort.signal.aborted) {
          setLoading(false);
          // Rendition is mounted and page 1 is laid out — compute its notes.
          setReaderReady((n) => n + 1);
        }
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
              "reader-content min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-6",
              book.ext === "txt" && "flex justify-center",
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
