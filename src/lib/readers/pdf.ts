export async function renderPdfPages(
  arrayBuffer: ArrayBuffer,
  container: HTMLElement,
  signal?: AbortSignal,
) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;

  container.innerHTML = "";

  for (let n = 1; n <= totalPages; n++) {
    if (signal?.aborted) return;

    if (totalPages > 1) {
      let prog = container.querySelector(
        ".pdf-progress",
      ) as HTMLParagraphElement | null;
      if (!prog) {
        prog = document.createElement("p");
        prog.className =
          "pdf-progress text-center text-[0.8rem] text-muted-foreground py-3 pb-6";
        container.appendChild(prog);
      }
      prog.textContent = `Rendering page ${n} of ${totalPages}…`;
    }

    const page = await pdf.getPage(n);
    const bodyWidth = Math.max(container.clientWidth - 48, 300);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.8, bodyWidth / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({
      canvasContext: canvas.getContext("2d")!,
      viewport,
    }).promise;

    const wrapper = document.createElement("div");
    wrapper.className =
      "pdf-page-wrapper mx-auto mb-4 overflow-hidden rounded-lg bg-white shadow-[0_2px_12px_rgba(0,0,0,0.08)]";
    wrapper.appendChild(canvas);

    const prog = container.querySelector(".pdf-progress");
    container.insertBefore(wrapper, prog);
  }

  container.querySelector(".pdf-progress")?.remove();
}
