import JSZip from "jszip";

type ManifestItem = { id: string; href: string; mt: string };
type TocEntry = { label: string; href: string };

export type EpubNavState = {
  canPrev: boolean;
  canNext: boolean;
  pageLabel: string;
};

export type EpubRendition = {
  destroy: () => void;
  prev: () => Promise<void>;
  next: () => Promise<void>;
  themes: {
    fontSize: (px: string) => void;
  };
};

export type EpubMountOptions = {
  file: File;
  contentEl: HTMLElement;
  tocListEl: HTMLElement;
  fontSize: number;
  onTocVisibility?: (hasToc: boolean) => void;
  onNavChange?: (state: EpubNavState) => void;
};

const CHAPTER_LABEL_RE =
  /^(?:chapter|part|section|book|volume|preface|introduction|intro|conclusion|appendix|epilogue|prologue|afterword)(?:\s+[\w.]+)?\.?$/i;

export async function mountEpubReader(
  options: EpubMountOptions,
): Promise<EpubRendition> {
  const {
    file,
    contentEl,
    tocListEl,
    fontSize,
    onTocVisibility,
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

  const viewerEl = document.createElement("div");
  viewerEl.id = "epub-viewer";
  viewerEl.style.cssText = [
    "width:100%",
    "min-height:600px",
    "overflow-y:auto",
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

  contentEl.innerHTML = "";
  contentEl.classList.add("is-epub");
  contentEl.appendChild(viewerEl);

  let currentIdx = 0;
  let activeTocLink: HTMLAnchorElement | null = null;

  function setActiveTocLink(linkEl: HTMLAnchorElement | null) {
    if (activeTocLink) activeTocLink.classList.remove("active");
    activeTocLink = linkEl;
    if (activeTocLink) activeTocLink.classList.add("active");
  }

  async function displayItem(idx: number, callerLink: HTMLAnchorElement | null = null) {
    if (idx < 0 || idx >= spine.length) return;
    currentIdx = idx;
    viewerEl.innerHTML =
      '<p style="color:#888;text-align:center;padding:2rem">Loading…</p>';

    const item = spine[idx];
    const html = await readZip(abs(item.href));
    const bm = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    let body = bm ? bm[1] : html;

    body = body.replace(
      /<(link|meta|script)\b[^>]*\/?>(?:[\s\S]*?<\/\1>)?/gi,
      "",
    );
    body = body.replace(
      /<p[^>]*>(?:\s|&nbsp;|&#160;|&#xA0;)*<\/p>/gi,
      "",
    );
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

    viewerEl.innerHTML = `<style>
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
      img  { max-width:100%; height:auto; display:block; margin:1.25rem auto; }
      pre, code { white-space:pre-wrap; font-family:monospace; line-height:1.5; }
      a    { color:#2E6DA4; }
      blockquote { border-left:3px solid #c5cdd8; margin:1em 0; padding-left:1em; color:#555; }
    </style>${body}`;
    viewerEl.scrollTop = 0;

    if (callerLink) {
      setActiveTocLink(callerLink);
    } else {
      const firstMatch =
        [...tocListEl.querySelectorAll<HTMLAnchorElement>(".toc-link")].find(
          (el) => el.dataset.filehref === item.href,
        ) ?? null;
      setActiveTocLink(firstMatch);
    }

    const tocMatch = tocEntries.find((e) =>
      item.href.endsWith(e.href.split("#")[0]),
    );
    onNavChange?.({
      canPrev: idx > 0,
      canNext: idx < spine.length - 1,
      pageLabel: tocMatch
        ? tocMatch.label
        : `Part ${idx + 1} of ${spine.length}`,
    });
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

    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const [, frag] = entry.href.split("#");
      const idx = spine.indexOf(spineItem);
      if (idx !== currentIdx) {
        await displayItem(idx, a);
      } else {
        setActiveTocLink(a);
      }
      if (frag) {
        const target = viewerEl.querySelector("#" + CSS.escape(frag));
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });

    li.appendChild(a);
    tocListEl.appendChild(li);
  }

  onTocVisibility?.(tocEntries.length > 0);

  await displayItem(0);

  return {
    destroy() {
      Object.values(imgBlobCache).forEach((u) => URL.revokeObjectURL(u));
    },
    prev: () => displayItem(currentIdx - 1),
    next: () => displayItem(currentIdx + 1),
    themes: {
      fontSize(px: string) {
        viewerEl.style.fontSize = px;
      },
    },
  };
}
