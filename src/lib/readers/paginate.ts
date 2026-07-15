/**
 * Splits a blob of HTML into an array of HTML fragments that each fit inside
 * a fixed-size "page" box (used to feed react-pageflip's book pages).
 *
 * Approach: render the content off-screen at the target page width, then
 * greedily accumulate top-level block nodes into a page until the next node
 * would overflow the page height, measuring real layout via scrollHeight.
 */

export type PaginateOptions = {
  width: number;
  height: number;
  fontSize: number;
  lineHeight?: number;
  css?: string;
};

const MEASURE_ROOT_ID = "pm-paginate-measure-root";

function getMeasureRoot(): HTMLDivElement {
  let el = document.getElementById(MEASURE_ROOT_ID) as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = MEASURE_ROOT_ID;
    el.style.cssText =
      "position:fixed;top:-99999px;left:-99999px;visibility:hidden;pointer-events:none;z-index:-1;";
    document.body.appendChild(el);
  }
  return el;
}

function normalizeTextNodes(container: HTMLElement) {
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    if (!node.textContent || !node.textContent.trim()) {
      container.removeChild(node);
      continue;
    }
    const p = document.createElement("p");
    p.textContent = node.textContent;
    container.replaceChild(p, node);
  }
}

export function paginateHtml(html: string, opts: PaginateOptions): string[] {
  const root = getMeasureRoot();
  root.innerHTML = "";

  if (opts.css) {
    const styleEl = document.createElement("style");
    styleEl.textContent = opts.css;
    root.appendChild(styleEl);
  }

  const source = document.createElement("div");
  source.innerHTML = html;
  normalizeTextNodes(source);
  const nodes = Array.from(source.childNodes);
  if (nodes.length === 0) return [""];

  const measureBox = document.createElement("div");
  measureBox.style.cssText = [
    `width:${opts.width}px`,
    `font-size:${opts.fontSize}px`,
    `line-height:${opts.lineHeight ?? 1.7}`,
    "box-sizing:border-box",
  ].join(";");
  root.appendChild(measureBox);

  const pages: string[] = [];
  let page = document.createElement("div");
  measureBox.appendChild(page);

  const flushPage = () => {
    pages.push(page.innerHTML);
    page = document.createElement("div");
    measureBox.innerHTML = "";
    measureBox.appendChild(page);
  };

  for (const node of nodes) {
    page.appendChild(node.cloneNode(true));
    if (measureBox.scrollHeight <= opts.height) continue;

    if (page.childNodes.length === 1) {
      // A single block is already taller than one page (e.g. a big image) —
      // let it stand alone rather than trying to split it further.
      flushPage();
      continue;
    }

    const overflowNode = page.lastChild!;
    page.removeChild(overflowNode);
    flushPage();
    page.appendChild(node.cloneNode(true));
  }
  if (page.childNodes.length > 0) pages.push(page.innerHTML);

  root.innerHTML = "";
  return pages.length > 0 ? pages : [""];
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Converts plain text into one <p> per line so paginateHtml has fine-grained
 * blocks to work with, regardless of the source file's paragraph spacing. */
export function textToParagraphHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => `<p>${line.trim() ? escapeHtml(line) : "&nbsp;"}</p>`)
    .join("");
}
