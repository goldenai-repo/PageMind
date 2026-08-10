import { createFlowReader } from "./flow-reader";
import type { ReaderMode } from "./reader-mode";
import type {
  ReaderNavState,
  ReaderRendition,
} from "./types";

export type TxtMountOptions = {
  text: string;
  contentEl: HTMLElement;
  fontSize: number;
  mode?: ReaderMode;
  /** 0-based section to resume. */
  initialSectionIdx?: number;
  onNavChange?: (state: ReaderNavState) => void;
  onToc?: (items: ReaderTocItem[]) => void;
  onTocActive?: (id: string | null) => void;
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function mountTxtReader(options: TxtMountOptions): ReaderRendition {
  const {
    text,
    contentEl,
    fontSize,
    mode,
    initialSectionIdx,
    onNavChange,
    onToc,
    onTocActive,
    sectionSize,
  } = options;
  // Sections are only a layout/performance split — not real chapters.
  // Do not invent a Contents sidebar for TXT.
  const sections = splitIntoSections(text, sectionSize);

  const reader = createFlowReader({
    contentEl,
    mode: mode ?? "flip",
    fontSize,
    initialSectionIdx,
    sectionCount: sections.length,
    loadSection: (idx) => escapeHtml(sections[idx]),
    flowClassName: "pm-flow-txt",
    card: { className: "reader-txt" },
    fontSizeTarget: "pager",
    onNavChange,
    toc: [],
    onToc,
    onTocActive,
    label: ({ page, pageCount, mode: m }) => {
      if (m === "scroll") return "Continuous scroll";
      return `Page ${page + 1} of ${pageCount}`;
    },
  });

  reader.start();
  return reader;
}
