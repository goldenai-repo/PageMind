import type { BookExt } from "@/lib/books";

const MAX_AUTHOR_LEN = 160;

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

export async function extractEpubAuthor(
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
  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) return undefined;
  return parseCreatorsFromOpf(opfXml);
}

/** Best-effort PDF Info dictionary `/Author (...)`. */
export function extractPdfAuthor(bytes: Buffer | Uint8Array): string | undefined {
  const view = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  const head = view.subarray(0, Math.min(view.length, 1024 * 1024)).toString("latin1");
  const m = head.match(/\/Author\s*\(((?:\\.|[^\\)])*)\)/);
  if (!m?.[1]) return undefined;
  const decoded = m[1]
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\(\d{1,3})/g, (_, oct) =>
      String.fromCharCode(parseInt(oct, 8) & 255),
    );
  const name = cleanAuthorName(decoded);
  return name || undefined;
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
