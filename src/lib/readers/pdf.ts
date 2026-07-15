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
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
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
