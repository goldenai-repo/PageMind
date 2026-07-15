"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, List, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { LibraryBook } from "@/lib/books";
import {
  openEpubBook,
  type EpubBook,
  type EpubChapter,
} from "@/lib/readers/epub-engine";
import { renderPdfPageImages, type PdfPageImage } from "@/lib/readers/pdf";
import { paginateHtml, textToParagraphHtml } from "@/lib/readers/paginate";
import { cn } from "@/lib/utils";

// react-pageflip touches the DOM as soon as it's imported, so it's loaded
// lazily on the client only, and only once the reader is actually opened.
const HTMLFlipBook = dynamic(() => import("react-pageflip"), { ssr: false });

type PageFlipInstance = {
  flipNext: (corner?: "top" | "bottom") => void;
  flipPrev: (corner?: "top" | "bottom") => void;
  turnToPage: (pageNum: number) => void;
  getCurrentPageIndex: () => number;
};
type FlipBookHandle = { pageFlip: () => PageFlipInstance };

/** Which end of the freshly (re)computed page list to land on. */
type NavIntent = "start" | "end" | "preserve";

/**
 * One page's content box. react-pageflip shows two of these side by side
 * (like an open book) whenever the flip area is wide enough for both, and
 * falls back to a single page on narrow/mobile viewports — see StPageFlip's
 * Render.calculateBoundsRect, which compares container width to width*2.
 */
function computePageBox(containerWidth: number, containerHeight: number) {
  const width = Math.round(
    Math.max(280, Math.min(460, (containerWidth - 64) / 2)),
  );
  const height = Math.round(Math.max(360, containerHeight - 40));
  return { width, height };
}

type BookReaderProps = {
  book: LibraryBook;
  onClose: () => void;
};

export function BookReader({ book, onClose }: BookReaderProps) {
  const tocListRef = useRef<HTMLUListElement>(null);
  const flipAreaRef = useRef<HTMLDivElement>(null);
  const flipRef = useRef<FlipBookHandle>(null);

  const abortRef = useRef<AbortController | null>(null);
  const epubBookRef = useRef<EpubBook | null>(null);
  const navIntentRef = useRef<NavIntent>("start");
  const pageIndexRef = useRef(0);

  const [fontSize, setFontSize] = useState(18);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [showEpubChrome, setShowEpubChrome] = useState(false);
  const [hasToc, setHasToc] = useState(false);

  const [viewportSize, setViewportSize] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const [txtHtml, setTxtHtml] = useState<string | null>(null);
  const [pdfImages, setPdfImages] = useState<PdfPageImage[] | null>(null);
  const [epubChapter, setEpubChapter] = useState<EpubChapter | null>(null);

  const [pages, setPages] = useState<string[]>([]);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    pageIndexRef.current = pageIndex;
  }, [pageIndex]);

  // Measure the flip area (excludes header/footer/TOC sidebar) so pages are
  // sized to fit exactly, and re-measure whenever it resizes (window resize,
  // TOC sidebar opening/closing, etc).
  useEffect(() => {
    const el = flipAreaRef.current;
    if (!el) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const measure = () =>
      setViewportSize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout);
      timeout = setTimeout(measure, 150);
    });
    observer.observe(el);
    measure();
    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, []);

  const loadChapter = useCallback(async (idx: number) => {
    const epubBook = epubBookRef.current;
    if (!epubBook) return;
    setLoading(true);
    try {
      const chapter = await epubBook.goToChapter(idx);
      if (abortRef.current?.signal.aborted) return;
      setEpubChapter(chapter);
    } catch (err) {
      if (abortRef.current?.signal.aborted) return;
      setError(
        err instanceof Error ? err.message : "Could not open this chapter.",
      );
    } finally {
      if (!abortRef.current?.signal.aborted) setLoading(false);
    }
  }, []);

  // Load the book whenever it changes. BookReader is remounted with
  // key={book.id} by the caller, so every field below already starts at its
  // useState initial value on a fresh book — no manual reset needed (and
  // resetting synchronously in the effect body would itself cause the extra
  // cascading render the react-hooks/set-state-in-effect rule warns about).
  useEffect(() => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    epubBookRef.current?.destroy();
    epubBookRef.current = null;

    const run = async () => {
      try {
        if (book.ext === "txt") {
          if (typeof book.data !== "string") {
            throw new Error("Invalid text file data.");
          }
          setTxtHtml(textToParagraphHtml(book.data));
        } else if (book.ext === "pdf") {
          if (!(book.data instanceof ArrayBuffer)) {
            throw new Error("Invalid PDF data.");
          }
          const container = flipAreaRef.current;
          const { width: pageBoxWidth } = computePageBox(
            container?.clientWidth ?? 900,
            container?.clientHeight ?? 700,
          );
          const images = await renderPdfPageImages(
            book.data,
            pageBoxWidth * 2,
            abort.signal,
          );
          if (abort.signal.aborted) return;
          setPdfImages(images);
        } else if (book.ext === "epub") {
          if (!(book.data instanceof File)) {
            throw new Error("Invalid EPUB data.");
          }
          const tocList = tocListRef.current;
          if (!tocList) throw new Error("Reader controls not ready.");

          setShowEpubChrome(true);
          const epubBook = await openEpubBook({
            file: book.data,
            tocListEl: tocList,
            onTocVisibility: (visible) => {
              setHasToc(visible);
              setTocOpen(visible);
            },
            onSelectChapter: (idx) => {
              navIntentRef.current = "start";
              void loadChapter(idx);
            },
          });
          if (abort.signal.aborted) {
            epubBook.destroy();
            return;
          }
          epubBookRef.current = epubBook;
          const chapter = await epubBook.goToChapter(0);
          if (abort.signal.aborted) return;
          setEpubChapter(chapter);
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
      epubBookRef.current?.destroy();
      epubBookRef.current = null;
    };
  }, [book, loadChapter]);

  const pageBox = useMemo(
    () =>
      viewportSize
        ? computePageBox(viewportSize.width, viewportSize.height)
        : null,
    [viewportSize],
  );

  // (Re)paginate whenever the raw content, font size, or page box changes.
  useEffect(() => {
    if (book.ext === "pdf") return;
    if (!pageBox) return;
    const html = book.ext === "txt" ? txtHtml : (epubChapter?.html ?? null);
    if (html == null) return;
    const css = book.ext === "epub" ? epubChapter?.css : undefined;

    const newPages = paginateHtml(html, {
      width: pageBox.width,
      height: pageBox.height,
      fontSize,
      css,
    });

    const intent = navIntentRef.current;
    navIntentRef.current = "preserve";

    setPages((prevPages) => {
      let nextIndex = 0;
      if (intent === "end") {
        nextIndex = newPages.length - 1;
      } else if (intent === "preserve" && prevPages.length > 0) {
        const ratio = pageIndexRef.current / prevPages.length;
        nextIndex = Math.round(ratio * newPages.length);
      }
      setPageIndex(Math.max(0, Math.min(newPages.length - 1, nextIndex)));
      return newPages;
    });
  }, [book.ext, txtHtml, epubChapter, fontSize, pageBox]);

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

  const pageCount = book.ext === "pdf" ? (pdfImages?.length ?? 0) : pages.length;

  const handleNext = useCallback(() => {
    if (pageIndex < pageCount - 1) {
      flipRef.current?.pageFlip().flipNext();
      return;
    }
    if (book.ext === "epub" && epubChapter && epubChapter.index < epubChapter.count - 1) {
      navIntentRef.current = "start";
      void loadChapter(epubChapter.index + 1);
    }
  }, [pageIndex, pageCount, book.ext, epubChapter, loadChapter]);

  const handlePrev = useCallback(() => {
    if (pageIndex > 0) {
      flipRef.current?.pageFlip().flipPrev();
      return;
    }
    if (book.ext === "epub" && epubChapter && epubChapter.index > 0) {
      navIntentRef.current = "end";
      void loadChapter(epubChapter.index - 1);
    }
  }, [pageIndex, book.ext, epubChapter, loadChapter]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") handleNext();
      else if (e.key === "ArrowLeft") handlePrev();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [handleNext, handlePrev]);

  const handleFlip = useCallback((e: { data: number }) => {
    setPageIndex(e.data);
  }, []);

  const adjustFont = (delta: number) => {
    setFontSize((n) => Math.min(32, Math.max(12, n + delta)));
  };

  const flipPages = useMemo(() => {
    if (book.ext === "pdf") {
      return (pdfImages ?? []).map((img, i) => (
        <div className="pm-flip-page" key={i}>
          <img
            src={img.src}
            alt={`Page ${i + 1}`}
            className="pm-flip-page__img"
            draggable={false}
          />
        </div>
      ));
    }
    return pages.map((html, i) => (
      <div className="pm-flip-page" key={i}>
        <div
          className="pm-page-content"
          style={{ fontSize }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    ));
  }, [book.ext, pdfImages, pages, fontSize]);

  const flipKey =
    book.ext === "epub"
      ? `${book.id}-${epubChapter?.index ?? 0}-${pageCount}-${fontSize}-${pageBox?.width}-${pageBox?.height}`
      : `${book.id}-${pageCount}-${fontSize}-${pageBox?.width}-${pageBox?.height}`;

  const pageLabel = useMemo(() => {
    if (book.ext === "pdf") {
      return pageCount ? `Page ${pageIndex + 1} of ${pageCount}` : "";
    }
    if (book.ext === "epub") {
      if (!epubChapter) return "";
      return `${epubChapter.label} · Page ${pageIndex + 1} of ${Math.max(pages.length, 1)}`;
    }
    return pages.length ? `Page ${pageIndex + 1} of ${pages.length}` : "";
  }, [book.ext, pageCount, epubChapter, pageIndex, pages.length]);

  const canPrev =
    pageIndex > 0 ||
    (book.ext === "epub" && !!epubChapter && epubChapter.index > 0);
  const canNext =
    pageIndex < pageCount - 1 ||
    (book.ext === "epub" && !!epubChapter && epubChapter.index < epubChapter.count - 1);

  const showFooterNav = !loading && !error && pageCount > 0;

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
            ref={flipAreaRef}
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#e4e7ee]"
            onClick={(e) => {
              // Click the left/right thirds of the viewport to turn pages,
              // in addition to dragging a page corner.
              if (e.target !== e.currentTarget) return;
              const { left, width } = e.currentTarget.getBoundingClientRect();
              const ratio = (e.clientX - left) / width;
              if (ratio < 0.33) handlePrev();
              else if (ratio > 0.67) handleNext();
            }}
          >
            {pageBox && pageCount > 0 ? (
              <HTMLFlipBook
                key={flipKey}
                ref={flipRef}
                width={pageBox.width}
                height={pageBox.height}
                size="fixed"
                minWidth={pageBox.width}
                maxWidth={pageBox.width}
                minHeight={pageBox.height}
                maxHeight={pageBox.height}
                startPage={pageIndex}
                showCover={false}
                usePortrait
                drawShadow
                flippingTime={550}
                maxShadowOpacity={0.5}
                startZIndex={0}
                autoSize={false}
                mobileScrollSupport
                clickEventForward
                useMouseEvents
                swipeDistance={30}
                showPageCorners
                disableFlipByClick={false}
                className="pm-flipbook"
                style={{}}
                onFlip={handleFlip}
              >
                {flipPages}
              </HTMLFlipBook>
            ) : null}

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
          </div>

          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-3 border-t border-border bg-white px-4 py-3",
              !showFooterNav && "hidden",
            )}
            aria-hidden={!showFooterNav}
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canPrev}
              onClick={handlePrev}
              className="rounded-md border-border text-navy"
            >
              <ChevronLeft className="size-3.5" />
              Previous
            </Button>
            <span
              className="min-w-0 flex-1 truncate text-center text-[0.82rem] text-muted-foreground"
              aria-live="polite"
            >
              {pageLabel}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canNext}
              onClick={handleNext}
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
