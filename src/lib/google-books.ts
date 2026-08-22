const GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes";
const TITLE_MATCH_MIN = 50;
const MAX_SUMMARY_CHARS = 4000;

export type GoogleBookVolume = {
  id?: string;
  volumeInfo?: {
    title?: string;
    authors?: string[];
    description?: string;
    infoLink?: string;
    canonicalVolumeLink?: string;
    language?: string;
  };
};

export type GoogleBooksList = {
  totalItems?: number;
  items?: GoogleBookVolume[];
  error?: { code?: number; message?: string };
};

export type GoogleBookSummary = {
  text: string;
  infoLink: string | null;
  volumeId: string | null;
};

/** Wire format for GET /api/books/[id]/summary */
export type BookSummaryJson = {
  text: string | null;
  source: "google-books" | null;
  infoLink: string | null;
};

export class GoogleBooksError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GoogleBooksError";
  }
}

export function googleBooksApiKey(): string | undefined {
  const key = process.env.GOOGLE_BOOKS_API_KEY?.trim();
  return key || undefined;
}

export function sanitizeQueryPart(value: string): string {
  return value.replace(/["“”]/g, " ").replace(/\s+/g, " ").trim();
}

export function buildSearchQueries(title: string, author?: string): string[] {
  const t = sanitizeQueryPart(title);
  const a = author ? sanitizeQueryPart(author) : "";
  if (!t) return [];
  const queries: string[] = [];
  if (a) queries.push(`intitle:"${t}" inauthor:"${a}"`);
  queries.push(`intitle:"${t}"`);
  queries.push(a ? `"${t}" "${a}"` : `"${t}"`);
  return [...new Set(queries)];
}

export function htmlToPlainText(html: string): string {
  let s = html.replace(/\r\n/g, "\n");
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*\/\s*p\s*>/gi, "\n\n");
  s = s.replace(/<\s*\/\s*div\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = decodeHtmlEntities(s);
  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (s.length > MAX_SUMMARY_CHARS) {
    const cut = s.slice(0, MAX_SUMMARY_CHARS);
    const at = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
    s = (at > MAX_SUMMARY_CHARS * 0.6 ? cut.slice(0, at + 1) : cut).trim();
  }
  return s;
}

function fromCodePointSafe(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return "";
  try {
    return String.fromCodePoint(n);
  } catch {
    return "";
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      fromCodePointSafe(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => fromCodePointSafe(Number(n)))
    .replace(/&amp;/gi, "&");
}

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, "");
}

export function titleScore(local: string, remote: string): number {
  const a = normalizeForMatch(local);
  const b = normalizeForMatch(remote);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    return Math.round(70 + 25 * ratio);
  }
  const aWords = words(local);
  const bWords = words(remote);
  if (aWords.length === 0 || bWords.length === 0) return 0;
  const bSet = new Set(bWords);
  const overlap = aWords.filter((w) => bSet.has(w)).length;
  const ratio = overlap / Math.max(aWords.length, bWords.length);
  return ratio >= 0.5 ? Math.round(40 + 40 * ratio) : Math.round(40 * ratio);
}

function words(value: string): string[] {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1);
}

export function authorScore(
  local: string | undefined,
  authors: string[] | undefined,
): number {
  if (!local || !authors?.length) return 0;
  const n = normalizeForMatch(local);
  if (!n) return 0;
  for (const author of authors) {
    const r = normalizeForMatch(author);
    if (!r) continue;
    if (n === r || n.includes(r) || r.includes(n)) return 40;
    const localLast = words(local).at(-1);
    if (localLast && localLast.length > 2 && r.includes(localLast)) return 25;
  }
  return 0;
}

export function pickBestVolume(
  items: GoogleBookVolume[],
  title: string,
  author?: string,
): GoogleBookVolume | null {
  let best: { item: GoogleBookVolume; score: number; hasDesc: boolean } | null =
    null;
  for (const item of items) {
    const info = item.volumeInfo;
    if (!info?.title) continue;
    const tScore = titleScore(title, info.title);
    if (tScore < TITLE_MATCH_MIN) continue;
    const desc = info.description ? htmlToPlainText(info.description) : "";
    const hasDesc = desc.length > 0;
    const score = tScore + authorScore(author, info.authors) + (hasDesc ? 15 : 0);
    if (
      !best ||
      (hasDesc && !best.hasDesc) ||
      (hasDesc === best.hasDesc && score > best.score)
    ) {
      best = { item, score, hasDesc };
    }
  }
  if (!best?.hasDesc) return null;
  return best.item;
}

function summaryFromVolume(item: GoogleBookVolume): GoogleBookSummary | null {
  const info = item.volumeInfo;
  const text = info?.description ? htmlToPlainText(info.description) : "";
  if (!text) return null;
  return {
    text,
    infoLink: info?.infoLink || info?.canonicalVolumeLink || null,
    volumeId: item.id ?? null,
  };
}

export async function fetchGoogleBookSummary(
  opts: { title: string; author?: string; apiKey?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleBookSummary | null> {
  const queries = buildSearchQueries(opts.title, opts.author);
  let lastError: GoogleBooksError | null = null;

  for (const q of queries) {
    try {
      const list = await requestVolumes(q, opts.apiKey, fetchImpl);
      const item = pickBestVolume(list.items ?? [], opts.title, opts.author);
      const summary = item ? summaryFromVolume(item) : null;
      if (summary) return summary;
    } catch (err) {
      if (err instanceof GoogleBooksError) {
        lastError = err;
        if (err.status === 429 || err.status === 403) throw err;
        continue;
      }
      throw err;
    }
  }

  if (lastError) throw lastError;
  return null;
}

async function requestVolumes(
  q: string,
  apiKey: string | undefined,
  fetchImpl: typeof fetch,
): Promise<GoogleBooksList> {
  const url = new URL(GOOGLE_BOOKS_URL);
  url.searchParams.set("q", q);
  url.searchParams.set("printType", "books");
  url.searchParams.set("maxResults", "8");
  if (apiKey) url.searchParams.set("key", apiKey);

  const res = await fetchImpl(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as GoogleBooksList;
  if (!res.ok) {
    const message =
      data.error?.message || `Google Books request failed (${res.status}).`;
    throw new GoogleBooksError(message, res.status);
  }
  return data;
}
