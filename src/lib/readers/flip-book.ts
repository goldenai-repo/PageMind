import type { PageFlip } from "page-flip";

export type FlipHandle = {
  destroy(): void;
  next(): void;
  prev(): void;
  index(): number;
  count(): number;
  isAtStart(): boolean;
  isAtEnd(): boolean;
};

export type MountFlipBookOptions = {
  /** Element the flip book is appended into. */
  host: HTMLElement;
  /** Page elements, one per book page (StPageFlip overwrites their styles). */
  pages: HTMLElement[];
  pageWidth: number;
  pageHeight: number;
  /** Two-page (landscape) spread instead of a single portrait page. */
  spread?: boolean;
  startAtEnd?: boolean;
  flippingTime?: number;
  onFlip?: (index: number, count: number) => void;
};

type PageFlipCtor = typeof PageFlip;

let ctorPromise: Promise<PageFlipCtor> | null = null;

/**
 * StPageFlip ships as a UMD browser bundle with no types and touches `window`
 * on import, so it must only be loaded on the client. Cache the constructor so
 * repeated flip builds don't re-import.
 */
async function getPageFlipCtor(): Promise<PageFlipCtor> {
  if (!ctorPromise) {
    ctorPromise = import("page-flip").then((mod) => {
      const m = mod as unknown as {
        PageFlip?: PageFlipCtor;
        default?: PageFlipCtor & { PageFlip?: PageFlipCtor };
      };
      const ctor = m.PageFlip ?? m.default?.PageFlip ?? m.default;
      if (!ctor) throw new Error("page-flip: PageFlip export not found");
      return ctor as PageFlipCtor;
    });
  }
  return ctorPromise;
}

/** Warm the StPageFlip import so the first real flip mounts without delay. */
export function prefetchFlipBook(): void {
  void getPageFlipCtor().catch(() => {
    ctorPromise = null;
  });
}

export async function mountFlipBook(
  options: MountFlipBookOptions,
): Promise<FlipHandle> {
  const { host, pages, pageWidth, pageHeight, spread = false } = options;
  const PageFlipCtor = await getPageFlipCtor();

  // StPageFlip sizes its book relative to the parent width and derives height
  // from an aspect-ratio wrapper (autoSize). Constrain the parent to the book
  // width (one page portrait, two pages landscape) so it is sized correctly.
  const pagesAcross = spread ? 2 : 1;
  const frame = document.createElement("div");
  frame.className = "pm-flip-frame";
  frame.style.width = `${pageWidth * pagesAcross}px`;
  frame.style.maxWidth = "100%";
  host.appendChild(frame);

  const block = document.createElement("div");
  block.className = "pm-flip-book";
  frame.appendChild(block);
  for (const page of pages) block.appendChild(page);

  const flip = new PageFlipCtor(block, {
    width: pageWidth,
    height: pageHeight,
    size: "fixed",
    usePortrait: !spread,
    autoSize: true,
    showCover: false,
    drawShadow: true,
    maxShadowOpacity: 0.5,
    flippingTime: options.flippingTime ?? 550,
    useMouseEvents: true,
    mobileScrollSupport: false,
    clickEventForward: true,
    swipeDistance: 30,
    showPageCorners: true,
    disableFlipByClick: false,
  });

  flip.loadFromHTML(pages);

  const count = () => flip.getPageCount();
  const index = () => flip.getCurrentPageIndex();

  if (options.startAtEnd) flip.turnToPage(Math.max(0, count() - 1));
  options.onFlip?.(index(), count());
  flip.on("flip", (e) => options.onFlip?.(Number(e.data), count()));

  return {
    destroy() {
      try {
        flip.destroy();
      } catch {
        // PageFlip.destroy also removes the block; ignore double-remove errors
      }
      frame.remove();
    },
    next: () => flip.flipNext(),
    prev: () => flip.flipPrev(),
    index,
    count,
    isAtStart: () => index() <= 0,
    isAtEnd: () => index() >= count() - 1,
  };
}
