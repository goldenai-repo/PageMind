/**
 * Reading layout modes offered by the reader for reflowable books (TXT/EPUB).
 *
 * - `flip`   single page; tap left/right to turn (no StPageFlip animation).
 * - `scroll` full-width continuous vertical scroll, no page turns.
 * - `spread` two pages side by side; same tap left/right as single page
 *            (StPageFlip animation when the viewport is wide enough).
 */
export type ReaderMode = "flip" | "scroll" | "spread";

export const READER_MODES: ReaderMode[] = ["flip", "scroll", "spread"];

export const DEFAULT_READER_MODE: ReaderMode = "flip";

const STORAGE_KEY = "pagemind:reader-mode";

export function isReaderMode(value: unknown): value is ReaderMode {
  return value === "flip" || value === "scroll" || value === "spread";
}

function storageKeyForUser(userId?: string | null): string {
  return userId ? `${STORAGE_KEY}:${userId}` : STORAGE_KEY;
}

/** Read the persisted reader mode, falling back to the default. */
export function loadReaderMode(userId?: string | null): ReaderMode {
  if (typeof window === "undefined") return DEFAULT_READER_MODE;
  try {
    const keyed = window.localStorage.getItem(storageKeyForUser(userId));
    if (isReaderMode(keyed)) return keyed;
    // Legacy global key (pre per-user).
    const legacy = window.localStorage.getItem(STORAGE_KEY);
    return isReaderMode(legacy) ? legacy : DEFAULT_READER_MODE;
  } catch {
    return DEFAULT_READER_MODE;
  }
}

/** Persist the chosen reader mode for next time (this browser). */
export function saveReaderMode(mode: ReaderMode, userId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKeyForUser(userId), mode);
    // Keep legacy key in sync so older code paths still see the choice.
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

// --- React external store (SSR-safe, avoids setState-in-effect hydration) ---

let cachedMode: ReaderMode | null = null;
let cachedUserId: string | null | undefined = undefined;
const listeners = new Set<() => void>();

export function subscribeReaderMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getReaderModeSnapshot(): ReaderMode {
  if (cachedMode === null) cachedMode = loadReaderMode(cachedUserId);
  return cachedMode;
}

export function getReaderModeServerSnapshot(): ReaderMode {
  return DEFAULT_READER_MODE;
}

/** Bind the store to a signed-in user and reload their local preference. */
export function bindReaderModeUser(userId: string | null): void {
  if (cachedUserId === userId && cachedMode !== null) return;
  cachedUserId = userId;
  cachedMode = loadReaderMode(userId);
  for (const listener of listeners) listener();
}

/** Update the active reader mode, persist it locally, and notify subscribers. */
export function setReaderMode(mode: ReaderMode): void {
  cachedMode = mode;
  saveReaderMode(mode, cachedUserId);
  for (const listener of listeners) listener();
}
