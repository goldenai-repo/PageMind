import JSZip from "jszip";

type ManifestItem = { id: string; href: string; mt: string };
type TocEntry = { label: string; href: string };

export type EpubChapter = {
  html: string;
  css: string;
  index: number;
  count: number;
  label: string;
};

export type EpubBook = {
  chapterCount: number;
  destroy: () => void;
  goToChapter: (idx: number) => Promise<EpubChapter | null>;
};

export type EpubOpenOptions = {
  file: File;
  tocListEl: HTMLElement;
  onTocVisibility?: (hasToc: boolean) => void;
  /** Fired when the reader should jump to a chapter (TOC link clicked). */
  onSelectChapter?: (idx: number) => void;
};

const CHAPTER_LABEL_RE =
  /^(?:chapter|part|section|book|volume|preface|introduction|intro|conclusion|appendix|epilogue|prologue|afterword)(?:\s+[\w.]+)?\.?$/i;

export async function openEpubBook(
  options: EpubOpenOptions,
): Promise<EpubBook> {
  const { file, tocListEl, onTocVisibility, onSelectChapter } = options;

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
  for (const item of Object.values(manifest).filter(
    (i) => i.mt === "text/css",
  )) {
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

  let activeTocLink: HTMLAnchorElement | null = null;
  function setActiveTocLink(linkEl: HTMLAnchorElement | null) {
    if (activeTocLink) activeTocLink.classList.remove("active");
    activeTocLink = linkEl;
    if (activeTocLink) activeTocLink.classList.add("active");
  }

  async function buildChapter(idx: number): Promise<EpubChapter | null> {
    if (idx < 0 || idx >= spine.length) return null;
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

    const tocMatch = tocEntries.find((e) =>
      item.href.endsWith(e.href.split("#")[0]),
    );
    const label = tocMatch ? tocMatch.label : `Part ${idx + 1} of ${spine.length}`;

    const link =
      [...tocListEl.querySelectorAll<HTMLAnchorElement>(".toc-link")].find(
        (el) => el.dataset.filehref === item.href,
      ) ?? null;
    setActiveTocLink(link);

    return { html: body, css: combinedCss, index: idx, count: spine.length, label };
  }

  tocListEl.innerHTML = "";
  for (const entry of tocEntries) {
    const [fileHref] = entry.href.split("#");
    const spineItem = spine.find(
      (s) =>
        s.href === fileHref ||
        s.href.endsWith(fileHref) ||
        fileHref.endsWith(s.href),
    );
    if (!spineItem) continue;

    const li = document.createElement("li");
    li.className = "toc-item";
    const a = document.createElement("a");
    a.className = "toc-link";
    a.textContent = entry.label;
    a.title = entry.label;
    a.dataset.href = entry.href;
    a.dataset.filehref = spineItem.href;
    a.href = "#";

    a.addEventListener("click", (e) => {
      e.preventDefault();
      onSelectChapter?.(spine.indexOf(spineItem));
    });

    li.appendChild(a);
    tocListEl.appendChild(li);
  }

  onTocVisibility?.(tocEntries.length > 0);

  return {
    chapterCount: spine.length,
    destroy() {
      Object.values(imgBlobCache).forEach((u) => URL.revokeObjectURL(u));
    },
    goToChapter: buildChapter,
  };
}
