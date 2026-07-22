export type Paginator = {
  readonly page: number;
  readonly pageCount: number;
  goTo(page: number): void;
  pageForElement(el: Element): number;
  /** Re-measure after a content swap and jump to the given page. */
  reset(page?: number): void;
  /** Re-measure after a size/font change, preserving the reading position. */
  reflow(): void;
  destroy(): void;
};

export type PaginatorOptions = {
  /** Fixed-size box the pages show through; becomes the clipping frame. */
  viewport: HTMLElement;
  /** Element whose content flows into one column per page. */
  pager: HTMLElement;
  /** Horizontal space between page columns, px. */
  gap?: number;
  /** Columns visible per turn: 1 (single page) or 2 (side-by-side spread). */
  columnsPerPage?: number;
  onPageChange?: (page: number, pageCount: number) => void;
};

/**
 * Paginates flowed content with CSS columns: each page shows `columnsPerPage`
 * columns and turning a page slides the scroll offset by that many columns.
 * With one column per page this is a single-page reader; with two it's an
 * open-book spread. Content never scrolls vertically.
 */
export function createPaginator(options: PaginatorOptions): Paginator {
  const { viewport, pager, gap = 48, onPageChange } = options;
  const cpp = Math.max(1, options.columnsPerPage ?? 1);

  viewport.style.height = "100%";
  viewport.style.overflow = "hidden";
  pager.style.height = "100%";
  pager.style.columnFill = "auto";
  pager.style.columnGap = `${gap}px`;

  let page = 0;
  let pageCount = 1;

  // Width of a single text column given how many share the viewport.
  const columnWidth = () =>
    Math.max(1, (viewport.clientWidth - (cpp - 1) * gap) / cpp);
  // A page turn advances by a full viewport width (cpp columns + gaps).
  const stride = () => viewport.clientWidth + gap;

  function measure() {
    pager.style.columnWidth = `${columnWidth()}px`;
    const colStride = columnWidth() + gap;
    // scrollWidth = totalColumns * colWidth + (totalColumns - 1) * gap
    const totalColumns = Math.max(
      1,
      Math.round((viewport.scrollWidth + gap) / colStride),
    );
    pageCount = Math.max(1, Math.ceil(totalColumns / cpp));
  }

  function apply() {
    viewport.scrollLeft = page * stride();
    onPageChange?.(page, pageCount);
  }

  function goTo(next: number) {
    page = Math.max(0, Math.min(pageCount - 1, next));
    apply();
  }

  function reset(toPage = 0) {
    measure();
    goTo(toPage);
  }

  function reflow() {
    const ratio = pageCount > 1 ? page / (pageCount - 1) : 0;
    measure();
    goTo(Math.round(ratio * (pageCount - 1)));
  }

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleReflow = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(reflow, 120);
  };
  // ResizeObserver also catches non-window size changes (e.g. the TOC
  // sidebar opening); it is absent in jsdom, hence the guard.
  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(scheduleReflow)
      : null;
  observer?.observe(viewport);
  window.addEventListener("resize", scheduleReflow);

  return {
    get page() {
      return page;
    },
    get pageCount() {
      return pageCount;
    },
    goTo,
    pageForElement(el) {
      const offset =
        el.getBoundingClientRect().left -
        viewport.getBoundingClientRect().left +
        viewport.scrollLeft;
      const colStride = columnWidth() + gap;
      const columnIndex = Math.floor((offset + gap / 2) / colStride);
      return Math.max(
        0,
        Math.min(pageCount - 1, Math.floor(columnIndex / cpp)),
      );
    },
    reset,
    reflow,
    destroy() {
      observer?.disconnect();
      window.removeEventListener("resize", scheduleReflow);
      clearTimeout(resizeTimer);
    },
  };
}
