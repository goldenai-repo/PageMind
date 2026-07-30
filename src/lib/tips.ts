import { openDB, TIPS_STORE } from "./storage";

export type TipType =
  | "background"
  | "controversy"
  | "deep-dive"
  | "connection"
  | "fact-check";

export type TipSource = "ai" | "user";

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

export type TipCard = {
  id: string;
  bookId: string;
  anchor: TipAnchor;
  type: TipType;
  title: string;
  body: string;
  references?: TipReference[];
  source: TipSource;
  createdAt: string; // ISO 8601
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

export async function loadTipsForBook(bookId: string): Promise<TipCard[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TIPS_STORE, "readonly");
    const index = tx.objectStore(TIPS_STORE).index("bookId");
    const req = index.getAll(bookId);
    req.onsuccess = () => {
      const tips = req.result as TipCard[];
      resolve(
        tips.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      );
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveTip(tip: TipCard): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TIPS_STORE, "readwrite");
    const req = tx.objectStore(TIPS_STORE).put(tip);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTip(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(TIPS_STORE, "readwrite");
    const req = tx.objectStore(TIPS_STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
