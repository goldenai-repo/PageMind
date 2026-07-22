import { createFlowReader } from "./flow-reader";
import type { ReaderMode } from "./reader-mode";
import type {
  ReaderNavState,
  ReaderRendition,
  ReaderTocItem,
} from "./types";

export type TxtMountOptions = {
  text: string;
  contentEl: HTMLElement;
  fontSize: number;
  mode?: ReaderMode;
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

/** First non-empty line of a section, trimmed for use as a sidebar label. */
function sectionLabel(section: string, idx: number): string {
  const firstLine = section
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine) {
    return firstLine.length > 40 ? firstLine.slice(0, 40) + "…" : firstLine;
  }
  return `Part ${idx + 1}`;
}

export function mountTxtReader(options: TxtMountOptions): ReaderRendition {
  const {
    text,
    contentEl,
    fontSize,
    mode,
    onNavChange,
    onToc,
    onTocActive,
    sectionSize,
  } = options;
  const sections = splitIntoSections(text, sectionSize);

  const toc: ReaderTocItem[] = sections.map((section, idx) => ({
    id: `part-${idx}`,
    label:
      sections.length > 1
        ? `Part ${idx + 1} — ${sectionLabel(section, idx)}`
        : sectionLabel(section, idx),
  }));

  const reader = createFlowReader({
    contentEl,
    mode: mode ?? "flip",
    fontSize,
    sectionCount: sections.length,
    loadSection: (idx) => escapeHtml(sections[idx]),
    flowClassName: "pm-flow-txt",
    card: { className: "reader-txt" },
    fontSizeTarget: "pager",
    onNavChange,
    toc,
    tocTarget: (id) => {
      const idx = Number(id.replace("part-", ""));
      return Number.isInteger(idx) ? { sectionIdx: idx } : null;
    },
    tocActive: (idx) => `part-${idx}`,
    onToc,
    onTocActive,
    label: ({ sectionIdx, page, pageCount, mode: m }) => {
      const many = sections.length > 1;
      const part = many ? ` · Part ${sectionIdx + 1}/${sections.length}` : "";
      if (m === "scroll") {
        return many
          ? `Part ${sectionIdx + 1}/${sections.length}`
          : "Continuous scroll";
      }
      return `Page ${page + 1} of ${pageCount}${part}`;
    },
  });

  reader.start();
  return reader;
}
