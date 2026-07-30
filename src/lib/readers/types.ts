export type ReaderNavState = {
  canPrev: boolean;
  canNext: boolean;
  pageLabel: string;
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
};
