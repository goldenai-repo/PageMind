import { createFlowReader } from "./flow-reader";
import type { ReaderMode } from "./reader-mode";
import { detectTxtChapters } from "./txt-chapters";
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

type ResolvedTxtToc = {
  id: string;
  label: string;
  sectionIdx: number;
};

function planTxtReader(
  text: string,
  sectionSize?: number,
): {
  sections: string[];
  toc: ReaderTocItem[];
  resolved: ResolvedTxtToc[];
} {
  // Catalog entries come from KMP chapter markers, not from layout splits.
  const chapters = detectTxtChapters(text);
  if (chapters.length === 0) {
    const sections = splitIntoSections(text, sectionSize);
    const start: ResolvedTxtToc = {
      id: "start",
      label: "Start",
      sectionIdx: 0,
    };
    return {
      sections,
      toc: [{ id: start.id, label: start.label, level: 0 }],
      resolved: [start],
    };
  }

  const sections: string[] = [];
  const resolved: ResolvedTxtToc[] = [];

  const firstStart = chapters[0].start;
  if (firstStart > 0) {
    sections.push(...splitIntoSections(text.slice(0, firstStart), sectionSize));
  }

  for (let i = 0; i < chapters.length; i++) {
    const start = chapters[i].start;
    const end = i + 1 < chapters.length ? chapters[i + 1].start : text.length;
    const parts = splitIntoSections(text.slice(start, end), sectionSize);
    const id = `ch-${i}`;
    resolved.push({
      id,
      label: chapters[i].label,
      sectionIdx: sections.length,
    });
    sections.push(...parts);
  }

  return {
    sections: sections.length > 0 ? sections : [text],
    toc: resolved.map(({ id, label }) => ({ id, label, level: 0 })),
    resolved,
  };
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
  const { sections, toc, resolved } = planTxtReader(text, sectionSize);

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
    toc,
    tocTarget: (id) => {
      const entry = resolved.find((t) => t.id === id);
      return entry ? { sectionIdx: entry.sectionIdx } : null;
    },
    tocActive: (idx) => {
      const exact = resolved.find((t) => t.sectionIdx === idx);
      if (exact) return exact.id;
      let nearest: ResolvedTxtToc | null = null;
      for (const t of resolved) {
        if (t.sectionIdx <= idx) nearest = t;
      }
      return nearest?.id ?? null;
    },
    onToc,
    onTocActive,
    label: ({ sectionIdx, page, pageCount, mode: m }) => {
      let nearest: ResolvedTxtToc | null = null;
      for (const t of resolved) {
        if (t.sectionIdx <= sectionIdx) nearest = t;
      }
      const base = nearest?.label;
      if (m === "scroll") return base || "Continuous scroll";
      const pagePart = `Page ${page + 1} of ${pageCount}`;
      return base ? `${base} · ${pagePart}` : pagePart;
    },
  });

  reader.start();
  return reader;
}
