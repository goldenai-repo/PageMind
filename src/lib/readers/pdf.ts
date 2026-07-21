export type PdfPageImage = {
  src: string;
  width: number;
  height: number;
};

export async function renderPdfPageImages(
  arrayBuffer: ArrayBuffer,
  maxWidth: number,
  signal?: AbortSignal,
): Promise<PdfPageImage[]> {
  const pdfjs = await import("pdfjs-dist");
  // Served from public/ (same pdfjs-dist build) so opening a book never
  // waits on a CDN fetch.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";

  // pdf.js transfers `data` to its worker, detaching the buffer — pass a
  // copy so the caller's stored buffer survives re-opens and StrictMode
  // effect re-runs.
  const pdf = await pdfjs.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const images: PdfPageImage[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    if (signal?.aborted) return images;

    const page = await pdf.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, Math.max(0.5, maxWidth / base.width));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({
      canvasContext: canvas.getContext("2d")!,
      viewport,
    }).promise;

    images.push({
      src: canvas.toDataURL("image/jpeg", 0.92),
      width: viewport.width,
      height: viewport.height,
    });
  }

  return images;
}
