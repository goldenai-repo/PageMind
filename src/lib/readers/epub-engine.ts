import JSZip from "jszip";

import { isolateCss } from "./css-scope";
import { createFlowReader } from "./flow-reader";
import type { ReaderMode } from "./reader-mode";
import type {
  ReaderNavState,
  ReaderRendition,
  ReaderTocItem,
} from "./types";

type ManifestItem = { id: string; href: string; mt: string; properties: string };
type TocEntry = { label: string; href: string; level: number };

function dirname(path: string): string {
  const i = path.replace(/\\/g, "/").lastIndexOf("/");
  return i >= 0 ? path.slice(0, i) : "";
}

function joinPath(baseDir: string, rel: string): string {
  const normalized = rel.replace(/\\/g, "/");
  const hash = normalized.indexOf("#");
  const pathPart = hash >= 0 ? normalized.slice(0, hash) : normalized;
  const frag = hash >= 0 ? normalized.slice(hash + 1) : "";
  const stacked = [
    ...baseDir.split("/").filter((p) => p && p !== "."),
    ...pathPart.split("/").filter((p) => p !== ""),
  ];
  const out: string[] = [];
  for (const p of stacked) {
    if (p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/") + (frag ? `#${frag}` : "");
}

function decodeXml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

function mergeChapterLabels(raw: TocEntry[]): TocEntry[] {
  const out: TocEntry[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (
      next &&
      CHAPTER_LABEL_RE.test(cur.label) &&
      cur.href.split("#")[0] === next.href.split("#")[0]
    ) {
      out.push({
        label: `${cur.label}: ${next.label}`,
        href: cur.href,
        level: cur.level,
      });
      i++;
    } else {
      out.push(cur);
    }
  }
  return out;
}

function parseNcxToc(ncx: string, ncxDir: string): TocEntry[] {
  const raw: TocEntry[] = [];
  let depth = 0;
  const tokenRe =
    /<navPoint\b[^>]*>|<\/navPoint>|<navLabel>\s*<text>([^<]*)<\/text>[\s\S]*?<content\s+src="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(ncx))) {
    const token = m[0];
    if (/^<navPoint\b/i.test(token)) {
      depth++;
      continue;
    }
    if (/^<\/navPoint>/i.test(token)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    const label = decodeXml(m[1] ?? "");
    const href = joinPath(ncxDir, decodeXml(m[2] ?? ""));
    if (label && href) {
      raw.push({ label, href, level: Math.max(0, depth - 1) });
    }
  }
  return mergeChapterLabels(raw);
}

function parseNavToc(html: string, navDir: string): TocEntry[] {
  const navMatch =
    html.match(/<nav\b[^>]*epub:type=["'][^"']*\btoc\b[^"']*["'][^>]*>([\s\S]*?)<\/nav>/i) ??
    html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/i);
  if (!navMatch) return [];
  const body = navMatch[1];
  const raw: TocEntry[] = [];
  let depth = 0;
  const tokenRe =
    /<(ol|ul)\b[^>]*>|<\/(ol|ul)>|<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(body))) {
    const tag = (m[1] || m[2] || "").toLowerCase();
    if (tag === "ol" || tag === "ul") {
      if (m[0].startsWith("</")) depth = Math.max(0, depth - 1);
      else depth++;
      continue;
    }
    const attrs = m[3] ?? "";
    const hrefRaw = (attrs.match(/\bhref="([^"]*)"/i) || [])[1] ?? "";
    const label = decodeXml(m[4] ?? "");
    if (!label || !hrefRaw || hrefRaw.startsWith("javascript:")) continue;
    raw.push({
      label,
      href: joinPath(navDir, decodeXml(hrefRaw)),
      level: Math.max(0, depth - 1),
    });
  }
  return mergeChapterLabels(raw);
}

export type EpubNavState = ReaderNavState;
export type EpubRendition = ReaderRendition;

export type EpubMountOptions = {
  file: File;
  contentEl: HTMLElement;
  fontSize: number;
  mode?: ReaderMode;
  /** 0-based spine section to resume. */
  initialSectionIdx?: number;
  onToc?: (items: ReaderTocItem[]) => void;
  onTocActive?: (id: string | null) => void;
  onNavChange?: (state: EpubNavState) => void;
};

export const CHAPTER_LABEL_RE =
  /^(?:chapter|part|section|book|volume|preface|introduction|intro|conclusion|appendix|epilogue|prologue|afterword)(?:\s+[\w.]+)?\.?$/i;

export async function mountEpubReader(
  options: EpubMountOptions,
): Promise<EpubRendition> {
  const {
    file,
    contentEl,
    fontSize,
    mode,
    initialSectionIdx,
    onToc,
    onTocActive,
    onNavChange,
  } = options;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (e) {
    throw new Error(
      "Cannot unzip this EPUB: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }

  const readZip = async (path: string) => {
    const entry = zip.file(path);
    if (!entry) throw new Error("EPUB is missing required file: " + path);
    return entry.async("string");
  };

  const containerXml = await readZip("META-INF/container.xml");
  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) throw new Error("Invalid EPUB: missing OPF path");
  const opfPath = opfMatch[1];
  const opfDir = dirname(opfPath);
  const abs = (href: string) => joinPath(opfDir, href).split("#")[0]!;

  const opfXml = await readZip(opfPath);
  const manifest: Record<string, ManifestItem> = {};
  for (const m of opfXml.matchAll(/<item\b[^>]*>/g)) {
    const get = (k: string) =>
      (m[0].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1] || "";
    const id = get("id");
    if (id) {
      manifest[id] = {
        id,
        href: get("href"),
        mt: get("media-type"),
        properties: get("properties"),
      };
    }
  }

  const spineIds = [...opfXml.matchAll(/<itemref[^>]+idref="([^"]+)"/g)].map(
    (m) => m[1],
  );
  const spine = spineIds
    .map((id) => manifest[id])
    .filter(
      (item): item is ManifestItem =>
        !!item && item.mt === "application/xhtml+xml",
    );

  if (spine.length === 0) {
    throw new Error("No readable XHTML content found in this EPUB's spine.");
  }

  const imgEntries: Record<string, ManifestItem> = {};
  for (const item of Object.values(manifest)) {
    if (item.mt.startsWith("image/")) imgEntries[item.href] = item;
  }
  const imgBlobCache: Record<string, string> = {};

  async function getImgBlob(href: string) {
    if (imgBlobCache[href]) return imgBlobCache[href];
    const item = imgEntries[href];
    if (!item) return null;
    const entry = zip.file(abs(href));
    if (!entry) return null;
    const blob = await entry.async("blob");
    imgBlobCache[href] = URL.createObjectURL(blob);
    return imgBlobCache[href];
  }

  let combinedCss = "";
  for (const item of Object.values(manifest).filter((i) => i.mt === "text/css")) {
    const entry = zip.file(abs(item.href));
    if (!entry) continue;
    combinedCss += (await entry.async("string")) + "\n";
  }

  let tocEntries: TocEntry[] = [];
  const navItem = Object.values(manifest).find((i) =>
    i.properties.split(/\s+/).includes("nav"),
  );
  if (navItem) {
    try {
      const navHtml = await readZip(abs(navItem.href));
      tocEntries = parseNavToc(navHtml, dirname(abs(navItem.href)));
    } catch {
      // ignore bad nav
    }
  }
  if (tocEntries.length === 0) {
    const ncxItem = Object.values(manifest).find(
      (i) => i.mt === "application/x-dtbncx+xml",
    );
    if (ncxItem) {
      try {
        const ncx = await readZip(abs(ncxItem.href));
        tocEntries = parseNcxToc(ncx, dirname(abs(ncxItem.href)));
      } catch {
        // ignore bad NCX
      }
    }
  }

  const viewerCssText = [
    "width:100%",
    "height:100%",
    "overflow:hidden",
    "background:#fff",
    "padding:1.5rem 3rem",
    "box-sizing:border-box",
    "border-radius:12px",
    "box-shadow:0 2px 18px rgba(0,0,0,.08)",
    `font-size:${fontSize}px`,
    "line-height:1.7",
    "color:#2a3140",
    "font-family:'Lora',Georgia,'Times New Roman',serif",
  ].join(";");

  // Typographic CSS injected ahead of every chapter's body, in every mode.
  // Isolated to .pm-flow-epub so EPUB resets cannot restyle the app sidebar.
  const contentCss = isolateCss(
    `
    ${combinedCss}
    :scope, p, div, span, li, td, th {
      font-family: 'Lora', Georgia, 'Times New Roman', serif;
      line-height: 1.7;
    }
    p { margin-top: 0.15em; margin-bottom: 0.15em; line-height: 1.7; }
    p:empty { display: none; }
    h1, h2, h3, h4, h5, h6 {
      font-family: 'Lora', Georgia, serif;
      color: #1B365D;
      line-height: 1.3;
      margin-top: 1.8em;
      margin-bottom: 0.4em;
      font-weight: 600;
    }
    img  { max-width:100%; max-height:95%; height:auto; display:block; margin:1.25rem auto; break-inside:avoid; }
    pre, code { white-space:pre-wrap; font-family:monospace; line-height:1.5; }
    a    { color:#2E6DA4; }
    blockquote { border-left:3px solid #c5cdd8; margin:1em 0; padding-left:1em; color:#555; }
  `,
    ".pm-flow-epub",
  );

  async function loadChapterHtml(idx: number): Promise<string> {
    const item = spine[idx];
    const html = await readZip(abs(item.href));
    const bm = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    let body = bm ? bm[1] : html;

    const inlineStyles: string[] = [];
    body = body.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css: string) => {
      inlineStyles.push(css);
      return "";
    });
    body = body.replace(
      /<(link|meta|script)\b[^>]*\/?>(?:[\s\S]*?<\/\1>)?/gi,
      "",
    );
    body = body.replace(/<p[^>]*>(?:\s|&nbsp;|&#160;|&#xA0;)*<\/p>/gi, "");
    body = body.replace(/(<br\s*\/?>\s*){3,}/gi, "<br>");

    const imgRefs = new Set<string>();
    for (const m of body.matchAll(/\b(?:src|xlink:href)="([^"]+)"/g)) {
      const u = m[1];
      if (!/^(https?:|data:|blob:|#)/.test(u)) imgRefs.add(u.split("#")[0]);
    }
    await Promise.all([...imgRefs].map((href) => getImgBlob(href)));

    body = body.replace(/\b(src|xlink:href)="([^"]+)"/g, (match, attr, url) => {
      if (/^(https?:|data:|blob:|#)/.test(url)) return match;
      const blobUrl = imgBlobCache[url.split("#")[0]];
      return blobUrl ? `${attr}="${blobUrl}"` : match;
    });

    if (inlineStyles.length === 0) return body;
    return `<style>${isolateCss(inlineStyles.join("\n"), ".pm-flow-epub")}</style>${body}`;
  }

  // Resolve each TOC entry to a spine section (+ optional fragment) up front so
  // the sidebar is plain data the React layer can render.
  type ResolvedToc = {
    id: string;
    label: string;
    sectionIdx: number;
    fragment?: string;
    level: number;
  };
  const resolvedToc: ResolvedToc[] = [];
  tocEntries.forEach((entry, i) => {
    const [fileHref, frag] = entry.href.split("#");
    const file = (fileHref ?? "").replace(/\\/g, "/");
    const spineIdx = spine.findIndex((s) => {
      const sh = joinPath(opfDir, s.href).replace(/\\/g, "/");
      const fh = file;
      return (
        sh === fh ||
        sh.endsWith("/" + fh) ||
        fh.endsWith("/" + sh) ||
        sh.split("/").pop() === fh.split("/").pop()
      );
    });
    if (spineIdx < 0) return;
    resolvedToc.push({
      id: `toc-${i}`,
      label: entry.label,
      sectionIdx: spineIdx,
      fragment: frag || undefined,
      level: entry.level,
    });
  });

  const toc: ReaderTocItem[] = resolvedToc.map(({ id, label, level }) => ({
    id,
    label,
    level,
  }));

  const reader = createFlowReader({
    contentEl,
    mode: mode ?? "flip",
    fontSize,
    initialSectionIdx,
    sectionCount: spine.length,
    loadSection: loadChapterHtml,
    flowClassName: "pm-flow-epub",
    contentCss,
    card: { id: "epub-viewer", cssText: viewerCssText },
    contentElClass: "is-epub",
    fontSizeTarget: "card",
    onNavChange,
    toc,
    tocTarget: (id) => {
      const entry = resolvedToc.find((t) => t.id === id);
      return entry
        ? { sectionIdx: entry.sectionIdx, fragment: entry.fragment }
        : null;
    },
    tocActive: (idx) => {
      // Exact chapter for this spine item.
      const exact = resolvedToc.find((t) => t.sectionIdx === idx);
      if (exact) return exact.id;
      // Spine sections with no TOC row (common) → keep highlighting the
      // nearest previous chapter so the sidebar always shows where you are.
      let nearest: (typeof resolvedToc)[number] | null = null;
      for (const t of resolvedToc) {
        if (t.sectionIdx <= idx) nearest = t;
      }
      return nearest?.id ?? null;
    },
    onToc,
    onTocActive,
    label: ({ sectionIdx, page, pageCount, mode: m }) => {
      const fromResolved = resolvedToc.find((t) => t.sectionIdx === sectionIdx);
      let base = fromResolved?.label;
      if (!base) {
        const item = spine[sectionIdx];
        const file = item.href.split("#")[0]!;
        const fromEntries = tocEntries.find((e) => {
          const href = e.href.split("#")[0]!;
          return file === href || file.endsWith(href) || href.endsWith(file);
        });
        base = fromEntries?.label;
      }
      if (!base) base = `Part ${sectionIdx + 1} of ${spine.length}`;
      if (m === "scroll") return base;
      const suffix = pageCount > 1 ? ` · ${page + 1}/${pageCount}` : "";
      return base + suffix;
    },
    onDestroy: () => {
      Object.values(imgBlobCache).forEach((u) => URL.revokeObjectURL(u));
    },
  });

  await reader.start();

  return reader;
}
