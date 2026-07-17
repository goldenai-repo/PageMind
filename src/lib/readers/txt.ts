import { createPaginator } from "./paginator";
import type { ReaderNavState, ReaderRendition } from "./types";

export type TxtMountOptions = {
  text: string;
  contentEl: HTMLElement;
  fontSize: number;
  onNavChange?: (state: ReaderNavState) => void;
  /** Max characters laid out at once; larger texts split at paragraph breaks. */
  sectionSize?: number;
};

const DEFAULT_SECTION_SIZE = 100_000;

/**
 * Splits a large text into sections so pagination only ever lays out one
 * section — column layout of a whole book at once is what makes big files
 * slow to open. Cuts prefer paragraph breaks, then line breaks.
 */
export function splitIntoSections(
  text: string,
  target = DEFAULT_SECTION_SIZE,
): string[] {
  if (text.length <= target * 1.5) return [text];

  const sections: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + target, text.length);
    if (end < text.length) {
      const para = text.lastIndexOf("\n\n", end);
      const line = text.lastIndexOf("\n", end);
      if (para > start + target / 2) end = para + 2;
      else if (line > start + target / 2) end = line + 1;
    }
    sections.push(text.slice(start, end));
    start = end;
  }
  return sections;
}

export function mountTxtReader(options: TxtMountOptions): ReaderRendition {
  const { text, contentEl, fontSize, onNavChange, sectionSize } = options;
  const sections = splitIntoSections(text, sectionSize);

  const pageEl = document.createElement("div");
  pageEl.className = "reader-txt";

  const viewportEl = document.createElement("div");
  const pagerEl = document.createElement("div");
  pagerEl.style.fontSize = `${fontSize}px`;

  viewportEl.appendChild(pagerEl);
  pageEl.appendChild(viewportEl);
  contentEl.innerHTML = "";
  contentEl.appendChild(pageEl);

  let sectionIdx = 0;

  function emitNav(page: number, pageCount: number) {
    const suffix =
      sections.length > 1
        ? ` · Part ${sectionIdx + 1}/${sections.length}`
        : "";
    onNavChange?.({
      canPrev: sectionIdx > 0 || page > 0,
      canNext: sectionIdx < sections.length - 1 || page < pageCount - 1,
      pageLabel: `Page ${page + 1} of ${pageCount}${suffix}`,
    });
  }

  const paginator = createPaginator({
    viewport: viewportEl,
    pager: pagerEl,
    onPageChange: emitNav,
  });

  function showSection(idx: number, atEnd = false) {
    sectionIdx = idx;
    pagerEl.textContent = sections[idx];
    paginator.reset(atEnd ? Number.MAX_SAFE_INTEGER : 0);
  }

  showSection(0);

  return {
    destroy: () => paginator.destroy(),
    prev: () => {
      if (paginator.page > 0) {
        paginator.goTo(paginator.page - 1);
      } else if (sectionIdx > 0) {
        showSection(sectionIdx - 1, true);
      }
    },
    next: () => {
      if (paginator.page < paginator.pageCount - 1) {
        paginator.goTo(paginator.page + 1);
      } else if (sectionIdx < sections.length - 1) {
        showSection(sectionIdx + 1);
      }
    },
    themes: {
      fontSize(px: string) {
        pagerEl.style.fontSize = px;
        paginator.reflow();
      },
    },
  };
}
