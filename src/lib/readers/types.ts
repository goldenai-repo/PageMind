import type { ReaderMode } from "./reader-mode";

export type ReaderNavState = {
  canPrev: boolean;
  canNext: boolean;
  pageLabel: string;
  /** 1-based page within the current pagination context (section or PDF). */
  page?: number;
  /** Pages in the current context (section page count, or PDF total). */
  totalPages?: number;
  /** 0–100 progress across the whole book when the engine can estimate it. */
  progressPercent?: number;
  /** Current section index for reflowable books (0-based). */
  sectionIdx?: number;
  /** Total sections for reflowable books. */
  sectionCount?: number;
};

/** A navigable entry shown in the reader sidebar (chapter / part / page). */
export type ReaderTocItem = {
  id: string;
  label: string;
  /** Nesting depth for indentation (0 = top level). */
  level?: number;
};

/** The text and location of what the reader is currently showing. */
export type ReaderContext = {
  text: string;
  chapterHref?: string;
  pageNumber?: number;
};

export type ReaderRendition = {
  destroy(): void;
  prev(): void | Promise<void>;
  next(): void | Promise<void>;
  /** Text and location of the current page — used to generate tips. */
  getContext(): ReaderContext | Promise<ReaderContext>;
  themes: {
    fontSize(px: string): void;
  };
  /**
   * Switch reading layout (flip / scroll / spread) in place, preserving the
   * current section. Only reflowable readers (TXT/EPUB) implement this.
   */
  setMode?(mode: ReaderMode): void | Promise<void>;
  /** Jump to a sidebar entry by id (chapter/part/page). */
  goToTocItem?(id: string): void | Promise<void>;
};
