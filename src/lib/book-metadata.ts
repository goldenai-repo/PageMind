import type { BookExt } from "@/lib/books";

const MAX_AUTHOR_LEN = 160;
const MAX_TITLE_LEN = 200;

export type TitleSource = "metadata" | "google-books" | "filename";

export type BookIdentity = {
  title: string;
  titleSource: TitleSource;
  author?: string;
};

/** Strip edition labels, translator credits, and nationality wrappers. */
export function cleanAuthorName(raw: string): string {
  let s = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ");

  s = s.replace(/[〔（(]\s*[英美德法日俄中韩]\s*[)）〕]/g, " ");
  s = s.replace(/^\s*(?:by|author)\s*[:：]?\s+/i, "");
  s = s.replace(/[著编編譯译作]\s*$/u, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > MAX_AUTHOR_LEN) s = s.slice(0, MAX_AUTHOR_LEN).trim();
  return s;
}

export function cleanBookTitle(raw: string): string {
  let s = raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > MAX_TITLE_LEN) s = s.slice(0, MAX_TITLE_LEN).trim();
  return s;
}

/**
 * Turn a slug/filename stem into a readable title.
 * `the-great-gatsby` → `The Great Gatsby`. Leaves CJK / mixed-case alone.
 */
export function humanizeFileTitle(raw: string): string {
  let s = raw
    .replace(/^(?:pg|id)\s*\d+[\s._-]*/i, "")
    .replace(/[_]+/g, " ")
    .replace(/[-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  s = cleanBookTitle(s);
  if (!s) return raw.trim();
  const asciiLetters = s.replace(/[^A-Za-z]/g, "");
  if (
    asciiLetters.length >= 3 &&
    s === s.toLowerCase() &&
    /[a-z]/.test(s)
  ) {
    s = s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return s;
}

/** Filename stem, humanized. Last-resort search hint — not a display title. */
export function titleFromFileName(fileName: string): string {
  const base =
    fileName
      .replace(/\\/g, "/")
      .split("/")
      .pop()
      ?.replace(/\.[^/.]+$/, "") ?? "";
  return humanizeFileTitle(base) || "Untitled";
}

/** True when the stored title still looks like a file stem, not a book name. */
export function looksLikeFileStemTitle(title: string): boolean {
  const t = title.trim();
  if (!t) return true;
  if (/\.(pdf|epub|txt|docx?)$/i.test(t)) return true;
  if (/[/\\]/.test(t)) return true;
  if (!/\s/.test(t) && /^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(t)) return true;
  return false;
}

export function needsCatalogTitleLookup(opts: {
  title: string;
  titleSource?: TitleSource;
}): boolean {
  if (opts.titleSource === "metadata" || opts.titleSource === "google-books") {
    return false;
  }
  if (opts.titleSource === "filename") {
    return looksLikeFileStemTitle(opts.title);
  }
  return true;
}

export function parseCreatorsFromOpf(opfXml: string): string | undefined {
  const creators: { role: string; name: string }[] = [];
  const re =
    /<(?:[\w.-]+:)?creator\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?creator>/gi;
  for (const m of opfXml.matchAll(re)) {
    const attrs = m[1] ?? "";
    const name = cleanAuthorName((m[2] ?? "").replace(/<[^>]+>/g, " "));
    if (!name) continue;
    const role =
      attrs.match(/opf:role=["']([^"']+)["']/i)?.[1] ??
      attrs.match(/\brole=["']([^"']+)["']/i)?.[1] ??
      "";
    creators.push({ role: role.toLowerCase(), name });
  }
  const preferred =
    creators.find((c) => c.role === "aut") ??
    creators.find((c) => !c.role) ??
    creators[0];
  return preferred?.name;
}

export function parseTitleFromOpf(opfXml: string): string | undefined {
  const titles: { type: string; name: string }[] = [];
  const re =
    /<(?:[\w.-]+:)?title\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?title>/gi;
  for (const m of opfXml.matchAll(re)) {
    const attrs = m[1] ?? "";
    const name = cleanBookTitle((m[2] ?? "").replace(/<[^>]+>/g, " "));
    if (!name) continue;
    const type =
      attrs.match(/opf:title-type=["']([^"']+)["']/i)?.[1] ??
      attrs.match(/title-type=["']([^"']+)["']/i)?.[1] ??
      "";
    titles.push({ type: type.toLowerCase(), name });
  }
  const preferred =
    titles.find((t) => t.type === "main") ??
    titles.find((t) => t.type !== "subtitle") ??
    titles[0];
  return preferred?.name;
}

async function loadOpfXml(
  bytes: Buffer | ArrayBuffer | Uint8Array,
): Promise<string | undefined> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const containerXml = await zip
    .file("META-INF/container.xml")
    ?.async("string");
  if (!containerXml) return undefined;
  const opfPath = containerXml.match(/full-path="([^"]+)"/)?.[1];
  if (!opfPath) return undefined;
  return zip.file(opfPath)?.async("string");
}

export async function extractEpubAuthor(
  bytes: Buffer | ArrayBuffer | Uint8Array,
): Promise<string | undefined> {
  const opfXml = await loadOpfXml(bytes);
  if (!opfXml) return undefined;
  return parseCreatorsFromOpf(opfXml);
}

export async function extractEpubTitle(
  bytes: Buffer | ArrayBuffer | Uint8Array,
): Promise<string | undefined> {
  const opfXml = await loadOpfXml(bytes);
  if (!opfXml) return undefined;
  return parseTitleFromOpf(opfXml);
}

function decodePdfLiteral(raw: string): string {
  return raw
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\(\d{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8) & 255),
    );
}

function pdfInfoLiteral(head: string, key: string): string | undefined {
  const re = new RegExp(`/${key}\\s*\\(((?:\\\\.|[^\\\\)])*)\\)`);
  const m = head.match(re);
  if (!m?.[1]) return undefined;
  return decodePdfLiteral(m[1]);
}

/** PDF `/Title` is often a Word dump — reject those, keep real titles. */
export function isUsablePdfTitle(raw: string): boolean {
  const s = cleanBookTitle(raw);
  if (s.length < 2) return false;
  const n = s.toLowerCase();
  if (
    /^(untitled|unknown|document|microsoft word|scan|pdf document)\b/.test(n)
  ) {
    return false;
  }
  if (/\.(docx?|pdf|pages|odt)$/i.test(s)) return false;
  if (/[/\\]/.test(s)) return false;
  return true;
}

function pdfInfoHead(bytes: Buffer | Uint8Array): string {
  const view = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  return view.subarray(0, Math.min(view.length, 1024 * 1024)).toString("latin1");
}

/** Best-effort PDF Info dictionary `/Author (...)`. */
export function extractPdfAuthor(bytes: Buffer | Uint8Array): string | undefined {
  const decoded = pdfInfoLiteral(pdfInfoHead(bytes), "Author");
  if (!decoded) return undefined;
  const name = cleanAuthorName(decoded);
  return name || undefined;
}

export function extractPdfTitle(bytes: Buffer | Uint8Array): string | undefined {
  const decoded = pdfInfoLiteral(pdfInfoHead(bytes), "Title");
  if (!decoded) return undefined;
  const title = cleanBookTitle(decoded);
  return isUsablePdfTitle(title) ? title : undefined;
}

export async function extractBookAuthor(
  ext: BookExt,
  bytes: Buffer | ArrayBuffer | Uint8Array,
): Promise<string | undefined> {
  try {
    if (ext === "epub") return await extractEpubAuthor(bytes);
    if (ext === "pdf") {
      const view =
        bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
      return extractPdfAuthor(view);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Display title + author for catalog storage.
 * EPUB: OPF `dc:title` / `dc:creator`. PDF: Info `/Title` when it looks like a
 * real book name (Word dumps are skipped). Filename is only a search hint.
 */
export async function extractBookIdentity(
  ext: BookExt,
  bytes: Buffer | ArrayBuffer | Uint8Array,
  fileName: string,
): Promise<BookIdentity> {
  const fromFile = titleFromFileName(fileName);
  try {
    if (ext === "epub") {
      const opfXml = await loadOpfXml(bytes);
      const metaTitle = opfXml ? parseTitleFromOpf(opfXml) : undefined;
      const author = opfXml ? parseCreatorsFromOpf(opfXml) : undefined;
      return {
        title: metaTitle || fromFile,
        titleSource: metaTitle ? "metadata" : "filename",
        ...(author ? { author } : {}),
      };
    }
    if (ext === "pdf") {
      const view =
        bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
      const metaTitle = extractPdfTitle(view);
      const author = extractPdfAuthor(view);
      return {
        title: metaTitle || fromFile,
        titleSource: metaTitle ? "metadata" : "filename",
        ...(author ? { author } : {}),
      };
    }
  } catch {
    return { title: fromFile, titleSource: "filename" };
  }
  return { title: fromFile, titleSource: "filename" };
}
