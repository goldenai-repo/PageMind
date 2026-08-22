import { computeSectionProgressPercent } from "@/lib/books";
import { tipAnchorInText } from "@/lib/tips";

import { mountFlipBook, prefetchFlipBook, type FlipHandle } from "./flip-book";
import { createPaginator, type Paginator } from "./paginator";
import type { ReaderMode } from "./reader-mode";
import type {
  ReaderNavState,
  ReaderRendition,
  ReaderTocItem,
} from "./types";

export type FlowLabelContext = {
  sectionIdx: number;
  page: number;
  pageCount: number;
  mode: ReaderMode;
};

export type FlowReaderOptions = {
  /** Host element the reader renders into (cleared and managed by the reader). */
  contentEl: HTMLElement;
  /** Initial reading mode. */
  mode: ReaderMode;
  /** 0-based section to open on start (resume). */
  initialSectionIdx?: number;
  /** Initial font size in px. */
  fontSize: number;
  /** Number of sections (chapters for EPUB, text parts for TXT). */
  sectionCount: number;
  /** Returns inner HTML for a section; may be async (EPUB chapter parsing). */
  loadSection: (idx: number) => string | Promise<string>;
  /** Builds the page label shown in the footer. */
  label: (ctx: FlowLabelContext) => string;
  /** CSS class applied to the flowing content element (typography). */
  flowClassName?: string;
  /** CSS injected as a <style> block ahead of every section's content. */
  contentCss?: string;
  /** Paginated-mode page card configuration. */
  card: { className?: string; id?: string; cssText?: string };
  /** Class toggled on the content host in paginated mode (e.g. "is-epub"). */
  contentElClass?: string;
  /** Which element carries the inline font size in paginated mode. */
  fontSizeTarget: "card" | "pager";
  onNavChange?: (state: ReaderNavState) => void;
  /** Called after a section is rendered (for TOC active state, etc.). */
  onSectionShown?: (sectionIdx: number) => void;
  /** Called when the reader is destroyed (for resource cleanup). */
  onDestroy?: () => void;
  /** Sidebar entries (chapters / parts). */
  toc?: ReaderTocItem[];
  /** Resolve a sidebar entry id to a section (+ optional fragment). */
  tocTarget?: (id: string) => { sectionIdx: number; fragment?: string } | null;
  /** Spine/file href for a section — used by smart notes to jump. */
  hrefForSection?: (idx: number) => string | undefined;
  /** Inverse of hrefForSection (filename match is fine). */
  sectionForHref?: (href: string) => number | null;
  /** Which sidebar entry id is active for a given section. */
  tocActive?: (sectionIdx: number) => string | null;
  /** Emits the sidebar entries once they're known. */
  onToc?: (items: ReaderTocItem[]) => void;
  /** Emits the active sidebar entry id when the section changes. */
  onTocActive?: (id: string | null) => void;
};

export type FlowReader = ReaderRendition & {
  setMode(mode: ReaderMode): Promise<void> | void;
  goToSection(idx: number, opts?: { fragment?: string }): Promise<void> | void;
  /** Renders the first section; await for async section loaders (EPUB). */
  start(): Promise<void> | void;
  readonly sectionIndex: number;
};

type RenderOpts = { atEnd?: boolean; fragment?: string };

const FLIP_PAD_X = 30;
const FLIP_PAD_Y = 40;
const FLIP_COL_GAP = 40;
const MIN_FLIP_DIMENSION = 200;
const MAX_FLIP_PAGES = 120;

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export function createFlowReader(options: FlowReaderOptions): FlowReader {
  const {
    contentEl,
    sectionCount,
    loadSection,
    label,
    flowClassName,
    contentCss,
    card,
    contentElClass,
    fontSizeTarget,
    onNavChange,
    onSectionShown,
    onDestroy,
    tocTarget,
    tocActive,
    hrefForSection,
    sectionForHref,
    onToc,
    onTocActive,
  } = options;

  let mode = options.mode;
  let fontSize = options.fontSize;
  let sectionIdx = 0;
  let currentHtml = "";
  let destroyed = false;
  let seq = 0;

  let paginator: Paginator | null = null;
  let flip: FlipHandle | null = null;
  let flipObserver: ResizeObserver | null = null;
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;

  // Live references to the elements carrying the inline font size, so font
  // changes don't depend on brittle DOM queries.
  let cardEl: HTMLElement | null = null;
  let pagerEl: HTMLElement | null = null;
  let scrollerEl: HTMLElement | null = null;

  // Tap-to-turn handler for single-page mode.
  let tapEl: HTMLElement | null = null;
  let tapHandler: ((e: MouseEvent) => void) | null = null;

  if (typeof window !== "undefined") prefetchFlipBook();

  // ---- helpers ---------------------------------------------------------

  function withStyle(html: string): string {
    return (contentCss ? `<style>${contentCss}</style>` : "") + html;
  }

  function emitNav(page: number, pageCount: number) {
    onNavChange?.({
      canPrev: page > 0 || sectionIdx > 0,
      canNext: page < pageCount - 1 || sectionIdx < sectionCount - 1,
      pageLabel: label({ sectionIdx, page, pageCount, mode }),
      page: page + 1,
      totalPages: Math.max(1, pageCount),
      progressPercent: computeSectionProgressPercent(
        sectionIdx,
        sectionCount,
        page,
        pageCount,
      ),
      sectionIdx,
      sectionCount,
    });
    onTocActive?.(tocActive?.(sectionIdx) ?? null);
  }

  function emitFlipNav() {
    if (!flip) return;
    const page = flip.index();
    const count = flip.count();
    onNavChange?.({
      canPrev: !flip.isAtStart() || sectionIdx > 0,
      canNext: !flip.isAtEnd() || sectionIdx < sectionCount - 1,
      pageLabel: label({ sectionIdx, page, pageCount: count, mode }),
      page: page + 1,
      totalPages: Math.max(1, count),
      progressPercent: computeSectionProgressPercent(
        sectionIdx,
        sectionCount,
        page,
        count,
      ),
      sectionIdx,
      sectionCount,
    });
    onTocActive?.(tocActive?.(sectionIdx) ?? null);
  }

  function detachTap() {
    if (tapEl && tapHandler) tapEl.removeEventListener("click", tapHandler);
    tapEl = null;
    tapHandler = null;
  }

  function teardownRenderers() {
    detachTap();
    flipObserver?.disconnect();
    flipObserver = null;
    clearTimeout(resizeTimer);
    flip?.destroy();
    flip = null;
    paginator?.destroy();
    paginator = null;
    cardEl = null;
    pagerEl = null;
    scrollerEl = null;
    contentEl.innerHTML = "";
  }

  function resetHostStyles() {
    contentEl.classList.remove(...(contentElClass ? [contentElClass] : []));
    contentEl.style.display = "";
    contentEl.style.justifyContent = "";
    contentEl.style.alignItems = "";
    contentEl.style.overflow = "";
    contentEl.scrollTop = 0;
  }

  // ---- paginated (single page + spread fallback) -----------------------

  function buildCard(): HTMLElement {
    const el = document.createElement("div");
    if (card.id) el.id = card.id;
    if (card.className) el.className = card.className;
    if (card.cssText) el.style.cssText = card.cssText;
    return el;
  }

  function renderPaginated(columnsPerPage: number, opts: RenderOpts) {
    const single = columnsPerPage === 1;
    resetHostStyles();
    if (contentElClass) contentEl.classList.add(contentElClass);
    contentEl.style.display = "flex";
    contentEl.style.justifyContent = "center";
    contentEl.style.alignItems = "stretch";
    contentEl.style.overflow = "hidden";

    const card_ = buildCard();
    card_.style.flex = "1 1 auto";
    card_.style.minWidth = "0";
    card_.style.width = "100%";
    card_.style.height = "100%";
    card_.style.alignSelf = "stretch";
    const viewport = document.createElement("div");
    // The page card fills the reading area; in single-page mode the text
    // column inside is kept to a comfortable measure (not full width).
    viewport.className =
      "pm-page-viewport" + (single ? " pm-page-viewport--single" : "");
    const pager = document.createElement("div");
    if (flowClassName) pager.classList.add(flowClassName);
    if (fontSizeTarget === "card") card_.style.fontSize = `${fontSize}px`;
    else pager.style.fontSize = `${fontSize}px`;

    pager.innerHTML = withStyle(currentHtml);
    viewport.appendChild(pager);
    card_.appendChild(viewport);
    contentEl.appendChild(card_);
    cardEl = card_;
    pagerEl = pager;
    scrollerEl = null;

    paginator = createPaginator({
      viewport,
      pager,
      columnsPerPage,
      onPageChange: emitNav,
    });
    paginator.reset(opts.atEnd ? Number.MAX_SAFE_INTEGER : 0);

    if (opts.fragment) {
      const target = pager.querySelector("#" + CSS.escape(opts.fragment));
      if (target) paginator.goTo(paginator.pageForElement(target));
    }
  }

  // Tap left quarter → previous page, elsewhere → next page.
  // Used for single-page and two-page (spread) modes.
  function attachTapNav(el: HTMLElement | null = cardEl) {
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("a")) return; // let links work
      const sel = typeof window !== "undefined" ? window.getSelection?.() : null;
      if (sel && sel.type === "Range" && String(sel).length > 0) return;
      const rect = el.getBoundingClientRect();
      if (e.clientX - rect.left < rect.width * 0.25) void prev();
      else void next();
    };
    el.addEventListener("click", handler);
    el.style.cursor = "pointer";
    tapEl = el;
    tapHandler = handler;
  }

  // ---- scroll ----------------------------------------------------------

  function renderScroll(opts: RenderOpts) {
    resetHostStyles();
    contentEl.style.display = "block";
    contentEl.style.overflow = "auto";

    // Outer sheet fills the reading area; inner is the centered measure.
    // Book CSS (html/body → :scope) is applied on a child so it cannot
    // override the centering margins — Holmes's cnepub stylesheet sets
    // body { margin-left: 1%; margin-right: 1% } which would otherwise
    // pin the column to the left in scroll mode.
    const scroller = document.createElement("div");
    scroller.className = "pm-scroll";
    const inner = document.createElement("div");
    inner.className = "pm-scroll-inner";
    const flow = document.createElement("div");
    if (flowClassName) flow.classList.add(flowClassName);
    flow.style.fontSize = `${fontSize}px`;
    flow.innerHTML = withStyle(currentHtml);
    inner.appendChild(flow);
    scroller.appendChild(inner);
    contentEl.appendChild(scroller);
    scrollerEl = flow;
    cardEl = null;
    pagerEl = null;

    emitNav(0, 1);

    if (opts.fragment) {
      const target = flow.querySelector("#" + CSS.escape(opts.fragment));
      target?.scrollIntoView();
    } else {
      contentEl.scrollTop = 0;
    }
  }

  // ---- spread (StPageFlip two-page book) -------------------------------

  function flipFeasible(): boolean {
    return (
      typeof window !== "undefined" &&
      contentEl.clientWidth >= MIN_FLIP_DIMENSION * 2 &&
      contentEl.clientHeight >= MIN_FLIP_DIMENSION
    );
  }

  function computeSpreadSize() {
    // Exclude the host's own padding so the two-page book fits fully inside the
    // reading area (its width is absolute pixels, not a flexible %).
    const cs = getComputedStyle(contentEl);
    const padX =
      (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    const margin = 8;
    const availW = contentEl.clientWidth - padX - margin * 2;
    const availH = contentEl.clientHeight - padY - margin * 2;
    const pageW = Math.floor(availW / 2);
    const pageH = availH;
    return {
      pageW,
      pageH,
      contentW: pageW - FLIP_PAD_X * 2,
      contentH: pageH - FLIP_PAD_Y * 2,
    };
  }

  function measureColumns(contentW: number, contentH: number): number {
    const host = document.createElement("div");
    host.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;width:${contentW}px;height:${contentH}px;overflow:hidden;`;
    if (flowClassName) host.className = flowClassName;
    host.style.fontSize = `${fontSize}px`;

    const cols = document.createElement("div");
    cols.style.columnWidth = `${contentW}px`;
    cols.style.columnGap = `${FLIP_COL_GAP}px`;
    cols.style.height = `${contentH}px`;
    cols.style.columnFill = "auto";
    cols.innerHTML = withStyle(currentHtml);

    host.appendChild(cols);
    document.body.appendChild(host);
    const colStride = contentW + FLIP_COL_GAP;
    const total = Math.max(
      1,
      Math.round((host.scrollWidth + FLIP_COL_GAP) / colStride),
    );
    document.body.removeChild(host);
    return total;
  }

  function buildFlipPage(
    pageW: number,
    pageH: number,
    contentW: number,
    contentH: number,
    columnIndex: number | null,
  ): HTMLElement {
    const stride = contentW + FLIP_COL_GAP;
    const page = document.createElement("div");
    page.className = "pm-flip-page";
    page.style.width = `${pageW}px`;
    page.style.height = `${pageH}px`;

    const face = document.createElement("div");
    face.className = "pm-flip-face";
    if (flowClassName) face.classList.add(flowClassName);
    face.style.padding = `${FLIP_PAD_Y}px ${FLIP_PAD_X}px`;
    face.style.fontSize = `${fontSize}px`;

    if (columnIndex !== null) {
      const clip = document.createElement("div");
      clip.className = "pm-flip-clip";
      const cols = document.createElement("div");
      cols.className = "pm-flip-cols";
      cols.style.columnWidth = `${contentW}px`;
      cols.style.columnGap = `${FLIP_COL_GAP}px`;
      cols.style.height = `${contentH}px`;
      cols.style.columnFill = "auto";
      cols.style.transform = `translateX(${-columnIndex * stride}px)`;
      cols.innerHTML = withStyle(currentHtml);
      clip.appendChild(cols);
      face.appendChild(clip);
    }

    page.appendChild(face);
    return page;
  }

  async function upgradeToFlip(mySeq: number, opts: RenderOpts) {
    if (!flipFeasible()) return;
    const { pageW, pageH, contentW, contentH } = computeSpreadSize();
    if (contentW < 40 || contentH < 40) return;

    let total = measureColumns(contentW, contentH);
    if (total > MAX_FLIP_PAGES) return; // keep the robust paginated fallback

    const faces: HTMLElement[] = [];
    for (let i = 0; i < total; i++) {
      faces.push(buildFlipPage(pageW, pageH, contentW, contentH, i));
    }
    // Two-page spreads read best with an even page count; pad with a blank
    // trailing page so the last spread is never a lone half.
    if (total % 2 === 1) {
      faces.push(buildFlipPage(pageW, pageH, contentW, contentH, null));
      total++;
    }
    if (mySeq !== seq || destroyed) return;

    try {
      // Swap the paginated base out for the flip book once it's ready.
      paginator?.destroy();
      paginator = null;
      cardEl = null;
      pagerEl = null;
      contentEl.innerHTML = "";
      resetHostStyles();
      contentEl.style.display = "flex";
      contentEl.style.justifyContent = "center";
      contentEl.style.alignItems = "center";
      contentEl.style.overflow = "hidden";

      const handle = await mountFlipBook({
        host: contentEl,
        pages: faces,
        pageWidth: pageW,
        pageHeight: pageH,
        spread: true,
        startAtEnd: opts.atEnd,
        onFlip: () => emitFlipNav(),
      });

      if (mySeq !== seq || destroyed) {
        handle.destroy();
        return;
      }
      flip = handle;
      emitFlipNav();
      // Same click zones as single-page: left → prev, right → next.
      attachTapNav(contentEl);
      watchFlipResize(mySeq);
    } catch {
      // StPageFlip failed — restore the paginated two-column view.
      if (mySeq !== seq || destroyed) return;
      renderPaginated(2, opts);
      attachTapNav();
    }
  }

  function watchFlipResize(mySeq: number) {
    if (typeof ResizeObserver === "undefined") return;
    let first = true;
    flipObserver = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (mode !== "spread" || mySeq !== seq || destroyed) return;
        void renderCurrent(seq, {});
      }, 200);
    });
    flipObserver.observe(contentEl);
  }

  // ---- render dispatch -------------------------------------------------

  function renderCurrent(mySeq: number, opts: RenderOpts): void {
    teardownRenderers();
    if (mode === "scroll") {
      renderScroll(opts);
    } else if (mode === "spread") {
      // Robust paginated base (also the jsdom/test path), upgraded to the
      // StPageFlip two-page book when the environment supports it.
      renderPaginated(2, opts);
      attachTapNav();
      void upgradeToFlip(mySeq, opts);
    } else {
      // Single page: paginated one column, advance by tapping the page.
      renderPaginated(1, opts);
      attachTapNav();
    }
    onSectionShown?.(sectionIdx);
    onTocActive?.(tocActive?.(sectionIdx) ?? null);
  }

  function showSection(
    idx: number,
    opts: RenderOpts = {},
  ): void | Promise<void> {
    if (idx < 0 || idx >= sectionCount) return;
    const mySeq = ++seq;
    sectionIdx = idx;
    const result = loadSection(idx);
    if (isPromise(result)) {
      return result.then((html) => {
        if (mySeq !== seq || destroyed) return;
        currentHtml = html;
        renderCurrent(mySeq, opts);
      });
    }
    currentHtml = result;
    renderCurrent(mySeq, opts);
  }

  // ---- public API ------------------------------------------------------

  function next(): void | Promise<void> {
    if (mode === "scroll") {
      if (sectionIdx < sectionCount - 1) return showSection(sectionIdx + 1);
      return;
    }
    if (paginator) {
      if (paginator.page < paginator.pageCount - 1) {
        paginator.goTo(paginator.page + 1);
      } else if (sectionIdx < sectionCount - 1) {
        return showSection(sectionIdx + 1);
      }
      return;
    }
    if (flip) {
      if (!flip.isAtEnd()) flip.next();
      else if (sectionIdx < sectionCount - 1) return showSection(sectionIdx + 1);
    }
  }

  function prev(): void | Promise<void> {
    if (mode === "scroll") {
      if (sectionIdx > 0) return showSection(sectionIdx - 1);
      return;
    }
    if (paginator) {
      if (paginator.page > 0) {
        paginator.goTo(paginator.page - 1);
      } else if (sectionIdx > 0) {
        return showSection(sectionIdx - 1, { atEnd: true });
      }
      return;
    }
    if (flip) {
      if (!flip.isAtStart()) flip.prev();
      else if (sectionIdx > 0)
        return showSection(sectionIdx - 1, { atEnd: true });
    }
  }

  function setFontSize(px: string) {
    const n = parseInt(px, 10);
    if (!Number.isNaN(n)) fontSize = n;

    // Flip pages bake the font size into their measured layout, so a change
    // means re-measuring and rebuilding the book.
    if (mode === "spread" && flip) {
      const mySeq = ++seq;
      renderCurrent(mySeq, {});
      return;
    }
    if (paginator) {
      if (fontSizeTarget === "card" && cardEl) cardEl.style.fontSize = px;
      else if (pagerEl) pagerEl.style.fontSize = px;
      paginator.reflow();
      return;
    }
    if (scrollerEl) scrollerEl.style.fontSize = px;
  }

  return {
    get sectionIndex() {
      return sectionIdx;
    },
    start: () => {
      onToc?.(options.toc ?? []);
      const initial = options.initialSectionIdx ?? 0;
      const idx = Math.min(
        Math.max(0, initial),
        Math.max(0, sectionCount - 1),
      );
      return showSection(idx);
    },
    prev,
    next,
    setMode(newMode: ReaderMode) {
      if (newMode === mode) return;
      mode = newMode;
      const mySeq = ++seq;
      renderCurrent(mySeq, {});
    },
    goToSection(idx: number, opts?: { fragment?: string }) {
      return showSection(idx, { fragment: opts?.fragment });
    },
    goToTocItem(id: string) {
      const target = tocTarget?.(id);
      if (!target) return;
      return showSection(target.sectionIdx, { fragment: target.fragment });
    },
    async goToPassage(target: {
      text: string;
      chapterHref?: string;
      pageNumber?: number;
    }) {
      const needle = target.text;
      if (!needle.trim()) return;

      const sectionText = () =>
        currentHtml
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ");

      const revealOnCurrentSection = () => {
        if (paginator) {
          for (let p = 0; p < paginator.pageCount; p++) {
            paginator.goTo(p);
            if (tipAnchorInText(paginator.getVisibleText(), needle)) return true;
          }
          paginator.goTo(0);
          return tipAnchorInText(paginator.getVisibleText(), needle);
        }
        if (scrollerEl) {
          const hay = scrollerEl.innerText || "";
          if (!tipAnchorInText(hay, needle)) return false;
          const nodes = scrollerEl.querySelectorAll("p, h1, h2, h3, h4, li");
          for (const el of nodes) {
            if (tipAnchorInText(el.textContent ?? "", needle)) {
              el.scrollIntoView({ block: "center" });
              return true;
            }
          }
          return true;
        }
        return tipAnchorInText(sectionText(), needle);
      };

      let idx: number | null = null;
      if (target.chapterHref && sectionForHref) {
        idx = sectionForHref(target.chapterHref);
      }

      if (idx != null) {
        await Promise.resolve(showSection(idx));
        revealOnCurrentSection();
        return;
      }

      for (let i = 0; i < sectionCount; i++) {
        await Promise.resolve(showSection(i));
        if (!tipAnchorInText(sectionText(), needle)) continue;
        revealOnCurrentSection();
        return;
      }
    },
    themes: {
      fontSize: setFontSize,
    },
    getContext() {
      const chapterHref = hrefForSection?.(sectionIdx);
      if (paginator) {
        return {
          text: paginator.getVisibleText(),
          pageNumber: paginator.page + 1,
          ...(chapterHref ? { chapterHref } : {}),
        };
      }
      if (scrollerEl) {
        return {
          text: scrollerEl.innerText || "",
          ...(chapterHref ? { chapterHref } : {}),
        };
      }
      return { text: "" };
    },
    destroy() {
      destroyed = true;
      seq++;
      teardownRenderers();
      resetHostStyles();
      onDestroy?.();
    },
  };
}
