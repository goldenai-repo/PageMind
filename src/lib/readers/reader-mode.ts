/**
 * Reading layout modes offered by the reader for reflowable books (TXT/EPUB).
 *
 * - `flip`   single page at a time with a realistic page-turn animation
 *            (powered by StPageFlip). This is the default.
 * - `scroll` full-width continuous vertical scroll, no page turns.
 * - `spread` two pages side by side, like an open book.
 */
export type ReaderMode = "flip" | "scroll" | "spread";

export const READER_MODES: ReaderMode[] = ["flip", "scroll", "spread"];

export const DEFAULT_READER_MODE: ReaderMode = "flip";

const STORAGE_KEY = "pagemind:reader-mode";

export function isReaderMode(value: unknown): value is ReaderMode {
  return (
    value === "flip" || value === "scroll" || value === "spread"
  );
}

/** Read the persisted reader mode, falling back to the default. */
export function loadReaderMode(): ReaderMode {
  if (typeof window === "undefined") return DEFAULT_READER_MODE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isReaderMode(stored) ? stored : DEFAULT_READER_MODE;
  } catch {
    return DEFAULT_READER_MODE;
  }
}

/** Persist the chosen reader mode for next time. */
export function saveReaderMode(mode: ReaderMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

// --- React external store (SSR-safe, avoids setState-in-effect hydration) ---

let cachedMode: ReaderMode | null = null;
const listeners = new Set<() => void>();

export function subscribeReaderMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReaderModeSnapshot(): ReaderMode {
  if (cachedMode === null) cachedMode = loadReaderMode();
  return cachedMode;
}

export function getReaderModeServerSnapshot(): ReaderMode {
  return DEFAULT_READER_MODE;
}

/** Update the active reader mode, persist it, and notify subscribers. */
export function setReaderMode(mode: ReaderMode): void {
  cachedMode = mode;
  saveReaderMode(mode);
  for (const listener of listeners) listener();
}
