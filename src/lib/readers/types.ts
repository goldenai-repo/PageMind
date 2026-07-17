export type ReaderNavState = {
  canPrev: boolean;
  canNext: boolean;
  pageLabel: string;
};

export type ReaderRendition = {
  destroy(): void;
  prev(): void | Promise<void>;
  next(): void | Promise<void>;
  themes: {
    fontSize(px: string): void;
  };
};
