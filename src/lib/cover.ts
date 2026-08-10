import type { BookExt } from "@/lib/books";

/**
 * Best-effort cover for shelf thumbnails.
 * - EPUB: embedded cover when present, else title gradient
 * - PDF: first page
 * - TXT / no file bytes: title gradient (color from name)
 */
export async function extractCoverImage(
  file: File | ArrayBuffer | string | null | undefined,
  ext: BookExt,
  opts?: { title?: string },
): Promise<Blob | null> {
  const title = opts?.title || "Untitled";
  try {
    if (ext === "txt") {
      return generateTitleCover(title, "TXT");
    }
    if (ext === "epub") {
      const bytes = await toArrayBuffer(file);
      if (!bytes) return generateTitleCover(title, "EPUB");
      const embedded = await extractEpubCover(bytes);
      return embedded ?? generateTitleCover(title, "EPUB");
    }
    if (ext === "pdf") {
      const bytes = await toArrayBuffer(file);
      if (!bytes) return generateTitleCover(title, "PDF");
      return (await extractPdfCover(bytes)) ?? generateTitleCover(title, "PDF");
    }
  } catch {
    return generateTitleCover(title, String(ext).toUpperCase());
  }
  return generateTitleCover(title, String(ext).toUpperCase());
}

/** Title gradient cover when we only have metadata (no file downloaded yet). */
export async function coverFromTitle(
  title: string,
  ext: BookExt,
): Promise<Blob | null> {
  return generateTitleCover(title || "Untitled", ext.toUpperCase());
}

async function toArrayBuffer(
  file: File | ArrayBuffer | string | null | undefined,
): Promise<ArrayBuffer | null> {
  if (!file) return null;
  if (file instanceof ArrayBuffer) return file;
  if (file instanceof File) return file.arrayBuffer();
  return null;
}

/** Deterministic palette from title so the same book always looks the same. */
function colorFromTitle(title: string): { bg: string; accent: string } {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) | 0;
  }
  const hues = [210, 195, 168, 145, 25, 350, 280, 200];
  const hue = hues[Math.abs(hash) % hues.length]!;
  return {
    bg: `hsl(${hue} 42% 28%)`,
    accent: `hsl(${hue} 35% 42%)`,
  };
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ["Untitled"];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
  }
  const last = lines[lines.length - 1]!;
  if (words.join(" ").length > last.length && lines.length === maxLines) {
    lines[lines.length - 1] =
      last.length > 3 ? `${last.slice(0, Math.max(1, last.length - 1))}…` : "…";
  }
  return lines;
}

/**
 * Synthetic A4 cover: colored panel + wrapped title.
 * Used for TXT and as fallback when EPUB/PDF have no usable image yet.
 */
export async function generateTitleCover(
  title: string,
  badge = "TXT",
): Promise<Blob | null> {
  if (typeof document === "undefined") return null;

  const w = 420;
  const h = Math.round(w * (297 / 210)); // A4 portrait
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const { bg, accent } = colorFromTitle(title);

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Spine shade
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.fillRect(0, 0, 28, h);

  // Soft highlight
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, "rgba(255,255,255,0.16)");
  grad.addColorStop(0.45, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Accent band
  ctx.fillStyle = accent;
  ctx.fillRect(48, h * 0.38, w - 80, 4);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = "600 36px Georgia, 'Times New Roman', serif";

  const lines = wrapLines(ctx, title || "Untitled", w - 100, 5);
  let y = h * 0.42;
  for (const line of lines) {
    ctx.fillText(line, 48, y);
    y += 46;
  }

  ctx.font = "500 18px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(badge, 48, h - 48);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.88);
  });
}

/** @deprecated Use generateTitleCover */
export async function generateTxtCover(title: string): Promise<Blob | null> {
  return generateTitleCover(title, "TXT");
}

async function extractEpubCover(data: ArrayBuffer): Promise<Blob | null> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(data);

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) return null;

  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) return null;
  const opfPath = opfMatch[1]!;
  const opfDir =
    opfPath.lastIndexOf("/") > 0
      ? opfPath.slice(0, opfPath.lastIndexOf("/"))
      : "";
  const abs = (href: string) => {
    if (href.startsWith("/")) return href.slice(1);
    return opfDir ? `${opfDir}/${href}` : href;
  };

  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) return null;

  type Item = { id: string; href: string; mt: string; props: string };
  const items: Item[] = [];
  for (const m of opfXml.matchAll(/<item\b[^>]+?\/>/gs)) {
    const get = (k: string) =>
      (m[0].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1] || "";
    const id = get("id");
    if (id) {
      items.push({
        id,
        href: get("href"),
        mt: get("media-type"),
        props: get("properties"),
      });
    }
  }

  const coverMeta =
    opfXml.match(
      /<meta[^>]+name=["']cover["'][^>]+content=["']([^"']+)["']/i,
    )?.[1] ||
    opfXml.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']cover["']/i,
    )?.[1];

  const byProp = items.find((i) => /\bcover-image\b/i.test(i.props));
  const byMeta = coverMeta
    ? items.find((i) => i.id === coverMeta)
    : undefined;
  const byName = items.find(
    (i) =>
      i.mt.startsWith("image/") &&
      /cover/i.test(i.href.split("/").pop() || ""),
  );

  const chosen = byProp || byMeta || byName;
  if (!chosen) return null;

  const entry = zip.file(abs(chosen.href));
  if (!entry) return null;
  return entry.async("blob");
}

async function extractPdfCover(data: ArrayBuffer): Promise<Blob | null> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

  const pdf = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  if (pdf.numPages < 1) {
    await pdf.destroy();
    return null;
  }

  const page = await pdf.getPage(1);
  // Thumbnail ~A4-ish width for crisp shelf cards without huge blobs.
  const targetW = 360;
  const viewport1 = page.getViewport({ scale: 1 });
  const scale = targetW / viewport1.width;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    await pdf.destroy();
    return null;
  }

  await page.render({ canvasContext: ctx, viewport }).promise;
  await pdf.destroy();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.82);
  });
}
