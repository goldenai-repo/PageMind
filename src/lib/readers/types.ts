import type { ReaderMode } from "./reader-mode";

export type ReaderNavState = {
  canPrev: boolean;
  canNext: boolean;
  pageLabel: string;
};

/** A navigable entry shown in the reader sidebar (chapter / part / page). */
export type ReaderTocItem = {
  id: string;
  label: string;
  /** Nesting depth for indentation (0 = top level). */
  level?: number;
};

export type ReaderRendition = {
  destroy(): void;
  prev(): void | Promise<void>;
  next(): void | Promise<void>;
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
