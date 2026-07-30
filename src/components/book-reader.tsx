"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Lightbulb, List, Sparkles, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LibraryBook } from "@/lib/books";
import { mountEpubReader } from "@/lib/readers/epub-engine";
import { mountPdfReader } from "@/lib/readers/pdf";
import { mountTxtReader } from "@/lib/readers/txt";
import type { ReaderNavState, ReaderRendition } from "@/lib/readers/types";
import {
  deleteTip,
  loadTipsForBook,
  saveTip,
  TIP_TYPES,
  type TipCard,
  type TipType,
} from "@/lib/tips";
import { cn } from "@/lib/utils";

type GeneratedTip = {
  type: TipType;
  title: string;
  body: string;
  anchorText: string;
  references: { label: string; url: string }[];
};

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
  const [tipsOpen, setTipsOpen] = useState(false);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsError, setTipsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTipsForBook(book.id)
      .then((loaded) => {
        if (cancelled) return;
        setTips(loaded);
        setTipsError(null);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [book.id]);

  const generateTips = async () => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    setTipsLoading(true);
    setTipsError(null);
    try {
      const context = await rendition.getContext();
      if (!context.text.trim()) {
        setTipsError("No readable text on this page yet.");
        return;
      }
      const res = await fetch("/api/tips/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookTitle: book.title, context }),
      });
      const data = (await res.json()) as {
        tips?: GeneratedTip[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to generate tips.");

      const now = new Date().toISOString();
      const generated = data.tips ?? [];
      const newTips: TipCard[] = generated.map((t) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        bookId: book.id,
        anchor: {
          text: t.anchorText,
          chapterHref: context.chapterHref,
          pageNumber: context.pageNumber,
        },
        type: t.type,
        title: t.title,
        body: t.body,
        references: t.references,
        source: "ai",
        createdAt: now,
      }));

      for (const tip of newTips) await saveTip(tip);
      setTips((prev) => [...prev, ...newTips]);
      if (newTips.length === 0) {
        setTipsError("No tips found for this page.");
      }
    } catch (e) {
      setTipsError(e instanceof Error ? e.message : "Failed to generate tips.");
    } finally {
      setTipsLoading(false);
    }
  };

  const removeTip = async (id: string) => {
    await deleteTip(id);
    setTips((prev) => prev.filter((t) => t.id !== id));
  };

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
            title="Tips"
            aria-pressed={tipsOpen}
            onClick={() => setTipsOpen((v) => !v)}
            className={cn(
              "relative rounded-md border-border bg-[#f0f2f5]",
              tipsOpen && "border-navy bg-navy/10 text-navy",
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
            tipsOpen ? "w-[320px]" : "w-0 border-l-0",
          )}
          aria-label="Tips"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-white px-3 py-3 text-[0.72rem] font-bold tracking-wider text-navy uppercase">
            <span className="px-1">Tips</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close tips"
              onClick={() => setTipsOpen(false)}
              className="text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>

          <div className="shrink-0 border-b border-border p-3">
            <Button
              type="button"
              size="sm"
              onClick={generateTips}
              disabled={tipsLoading}
              className="w-full gap-1.5 rounded-md font-semibold"
            >
              <Sparkles className="size-3.5" />
              {tipsLoading ? "Generating…" : "Generate tips for this page"}
            </Button>
            {tipsError ? (
              <p className="mt-2 text-[0.76rem] text-destructive">{tipsError}</p>
            ) : null}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-3">
            {tips.length === 0 && !tipsLoading ? (
              <p className="px-1 pt-6 text-center text-[0.8rem] leading-relaxed text-muted-foreground">
                No tips yet. Generate context, background, and controversies for
                the passage you&apos;re reading.
              </p>
            ) : null}
            {tips.map((tip) => {
              const meta = TIP_TYPES[tip.type];
              return (
                <div
                  key={tip.id}
                  className="group rounded-lg border border-border bg-white p-3 shadow-[0_2px_10px_rgba(27,54,93,0.06)]"
                  style={{ borderLeft: `4px solid ${meta.color}` }}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className="text-[0.62rem] font-bold tracking-wider uppercase"
                      style={{ color: meta.color }}
                    >
                      {meta.icon} {meta.label}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Delete tip"
                      onClick={() => void removeTip(tip.id)}
                      className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
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
