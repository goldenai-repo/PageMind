export type TipType =
  | "background"
  | "controversy"
  | "deep-dive"
  | "connection"
  | "fact-check";

export type TipReference = {
  label: string;
  url: string;
};

export type TipAnchor = {
  /** Verbatim passage the tip refers to. */
  text: string;
  chapterHref?: string;
  pageNumber?: number;
};

/** A pre-authored tip card, served read-only from the shared library. */
export type TipCard = {
  id: string;
  type: TipType;
  title: string;
  body: string;
  anchor: TipAnchor;
  references?: TipReference[];
};

/** Visual language for each tip type — icon, accent color, and label. */
export const TIP_TYPES: Record<
  TipType,
  { label: string; icon: string; color: string }
> = {
  background: { label: "Background", icon: "●", color: "#2E86AB" },
  controversy: { label: "Controversy", icon: "⚡", color: "#e68a2e" },
  "deep-dive": { label: "Deep dive", icon: "◈", color: "#7c3aed" },
  connection: { label: "Connection", icon: "⟷", color: "#27a96c" },
  "fact-check": { label: "Fact-check", icon: "✓", color: "#dc2626" },
};
