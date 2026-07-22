import type {
  ReaderNavState,
  ReaderRendition,
  ReaderTocItem,
} from "./types";

export type PdfMountOptions = {
  data: ArrayBuffer;
  contentEl: HTMLElement;
  signal?: AbortSignal;
  onNavChange?: (state: ReaderNavState) => void;
  onToc?: (items: ReaderTocItem[]) => void;
  onTocActive?: (id: string | null) => void;
};

/**
 * Shows one PDF page at a time, scaled to fit entirely inside the reading
 * area (page mode). Rendered pages are cached and neighbors prefetched so
 * page turns swap instantly; the cache resets when the area is resized.
 */
export async function mountPdfReader(
  options: PdfMountOptions,
): Promise<ReaderRendition> {
  const { data, contentEl, signal, onNavChange, onToc, onTocActive } = options;

  const pdfjs = await import("pdfjs-dist");
  // Served from public/ (same pdfjs-dist build) so opening a book never
  // waits on a CDN fetch.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

  // pdf.js transfers `data` to its worker, detaching the buffer — pass a
  // copy so the caller's stored buffer survives re-opens and StrictMode
  // effect re-runs.
  const pdf = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const totalPages = pdf.numPages;

  // Sidebar entries: one per page.
  onToc?.(
    Array.from({ length: totalPages }, (_, i) => ({
      id: `page-${i + 1}`,
      label: `Page ${i + 1}`,
    })),
  );

  const wrapper = document.createElement("div");
  wrapper.className =
    "pdf-page-wrapper overflow-hidden rounded-lg bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]";
  contentEl.innerHTML = "";
  contentEl.appendChild(wrapper);

  let current = 1;
  let showSeq = 0;
  let destroyed = false;

  function availableArea() {
    const cs = getComputedStyle(contentEl);
    const padX =
      (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    const padY =
      (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    return {
      width: Math.max(contentEl.clientWidth - padX, 100),
      height: Math.max(contentEl.clientHeight - padY, 100),
    };
  }

  let cache = new Map<number, Promise<HTMLCanvasElement>>();
  let cacheSize = "";

  function invalidateIfResized() {
    const avail = availableArea();
    const key = `${avail.width}x${avail.height}`;
    if (key !== cacheSize) {
      cacheSize = key;
      cache = new Map();
    }
    return avail;
  }

  function renderPage(
    n: number,
    avail: { width: number; height: number },
  ): Promise<HTMLCanvasElement> {
    const cached = cache.get(n);
    if (cached) return cached;

    const job = (async () => {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(
        avail.width / base.width,
        avail.height / base.height,
      );
      const viewport = page.getViewport({ scale });
      // Render at device resolution but display at CSS size for crisp text
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      canvas.style.display = "block";

      await page.render({
        canvasContext: canvas.getContext("2d")!,
        viewport: page.getViewport({ scale: scale * dpr }),
      }).promise;
      return canvas;
    })();

    cache.set(n, job);
    job.catch(() => cache.delete(n));
    return job;
  }

  async function show(n: number) {
    const seq = ++showSeq;
    const avail = invalidateIfResized();

    let canvas: HTMLCanvasElement;
    try {
      canvas = await renderPage(n, avail);
    } catch {
      return;
    }
    if (seq !== showSeq || destroyed || signal?.aborted) return;

    wrapper.replaceChildren(canvas);
    onNavChange?.({
      canPrev: n > 1,
      canNext: n < totalPages,
      pageLabel: `Page ${n} of ${totalPages}`,
    });
    onTocActive?.(`page-${n}`);

    // Warm the pages a turn away in either direction
    for (const m of [n + 1, n - 1]) {
      if (m >= 1 && m <= totalPages) void renderPage(m, avail);
    }
  }

  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRefit = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => void show(current), 150);
  };
  // ResizeObserver fires once on observe; skip that initial call so the
  // first render isn't done twice. Absent in jsdom, hence the guard.
  let observedOnce = false;
  const observer =
    typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          if (!observedOnce) {
            observedOnce = true;
            return;
          }
          scheduleRefit();
        })
      : null;
  observer?.observe(contentEl);
  window.addEventListener("resize", scheduleRefit);

  await show(current);

  return {
    destroy() {
      destroyed = true;
      showSeq++;
      observer?.disconnect();
      window.removeEventListener("resize", scheduleRefit);
      clearTimeout(resizeTimer);
      void pdf.destroy();
    },
    prev: async () => {
      if (current > 1) {
        current--;
        await show(current);
      }
    },
    next: async () => {
      if (current < totalPages) {
        current++;
        await show(current);
      }
    },
    goToTocItem: async (id) => {
      const n = Number(id.replace("page-", ""));
      if (Number.isInteger(n) && n >= 1 && n <= totalPages) {
        current = n;
        await show(current);
      }
    },
    themes: {
      fontSize() {
        // PDF pages are rasterized; font size does not apply.
      },
    },
  };
}
