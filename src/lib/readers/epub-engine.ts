import JSZip from "jszip";

import { createFlowReader } from "./flow-reader";
import type { ReaderMode } from "./reader-mode";
import type {
  ReaderNavState,
  ReaderRendition,
  ReaderTocItem,
} from "./types";

type ManifestItem = { id: string; href: string; mt: string };
type TocEntry = { label: string; href: string };

export type EpubNavState = ReaderNavState;
export type EpubRendition = ReaderRendition;

export type EpubMountOptions = {
  file: File;
  contentEl: HTMLElement;
  fontSize: number;
  mode?: ReaderMode;
  onToc?: (items: ReaderTocItem[]) => void;
  onTocActive?: (id: string | null) => void;
  onNavChange?: (state: EpubNavState) => void;
};

export const CHAPTER_LABEL_RE =
  /^(?:chapter|part|section|book|volume|preface|introduction|intro|conclusion|appendix|epilogue|prologue|afterword)(?:\s+[\w.]+)?\.?$/i;

export async function mountEpubReader(
  options: EpubMountOptions,
): Promise<EpubRendition> {
  const { file, contentEl, fontSize, mode, onToc, onTocActive, onNavChange } =
    options;

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
  const opfDir =
    opfPath.lastIndexOf("/") > 0
      ? opfPath.slice(0, opfPath.lastIndexOf("/"))
      : "";
  const abs = (href: string) => (opfDir ? `${opfDir}/` : "") + href;

  const opfXml = await readZip(opfPath);
  const manifest: Record<string, ManifestItem> = {};
  for (const m of opfXml.matchAll(/<item\b[^>]+?\/>/gs)) {
    const get = (k: string) =>
      (m[0].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1] || "";
    const id = get("id");
    if (id) manifest[id] = { id, href: get("href"), mt: get("media-type") };
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

  const tocEntries: TocEntry[] = [];
  const ncxItem = Object.values(manifest).find(
    (i) => i.mt === "application/x-dtbncx+xml",
  );
  if (ncxItem) {
    try {
      const ncx = await readZip(abs(ncxItem.href));
      const raw: TocEntry[] = [];
      for (const m of ncx.matchAll(
        /<navLabel>\s*<text>([^<]+)<\/text>[\s\S]*?<content\s+src="([^"]+)"/g,
      )) {
        raw.push({ label: m[1].trim(), href: m[2] });
      }
      for (let i = 0; i < raw.length; i++) {
        const cur = raw[i];
        const next = raw[i + 1];
        if (
          next &&
          CHAPTER_LABEL_RE.test(cur.label) &&
          cur.href.split("#")[0] === next.href.split("#")[0]
        ) {
          tocEntries.push({
            label: `${cur.label}: ${next.label}`,
            href: cur.href,
          });
          i++;
        } else {
          tocEntries.push(cur);
        }
      }
    } catch {
      // ignore bad NCX
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
  const contentCss = `
    ${combinedCss}
    body, p, div, span, li, td, th {
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
  `;

  async function loadChapterHtml(idx: number): Promise<string> {
    const item = spine[idx];
    const html = await readZip(abs(item.href));
    const bm = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    let body = bm ? bm[1] : html;

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

    return body;
  }

  // Resolve each TOC entry to a spine section (+ optional fragment) up front so
  // the sidebar is plain data the React layer can render.
  type ResolvedToc = {
    id: string;
    label: string;
    sectionIdx: number;
    fragment?: string;
  };
  const resolvedToc: ResolvedToc[] = [];
  tocEntries.forEach((entry, i) => {
    const [fileHref, frag] = entry.href.split("#");
    const spineItem = spine.find(
      (s) =>
        s.href === fileHref ||
        s.href.endsWith(fileHref) ||
        fileHref.endsWith(s.href),
    );
    if (!spineItem) return;
    resolvedToc.push({
      id: `toc-${i}`,
      label: entry.label,
      sectionIdx: spine.indexOf(spineItem),
      fragment: frag || undefined,
    });
  });

  const toc: ReaderTocItem[] = resolvedToc.map(({ id, label }) => ({
    id,
    label,
  }));

  const reader = createFlowReader({
    contentEl,
    mode: mode ?? "flip",
    fontSize,
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
    tocActive: (idx) =>
      resolvedToc.find((t) => t.sectionIdx === idx)?.id ?? null,
    onToc,
    onTocActive,
    label: ({ sectionIdx, page, pageCount, mode: m }) => {
      const item = spine[sectionIdx];
      const tocMatch = tocEntries.find((e) =>
        item.href.endsWith(e.href.split("#")[0]),
      );
      const base = tocMatch
        ? tocMatch.label
        : `Part ${sectionIdx + 1} of ${spine.length}`;
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
