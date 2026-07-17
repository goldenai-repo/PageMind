import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderPdfPages } from "@/lib/readers/pdf";
import * as pdfjsMock from "pdfjs-dist";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

function makeMockPdf(numPages: number) {
  return {
    numPages,
    getPage: vi.fn().mockImplementation(async () => ({
      getViewport: vi.fn().mockReturnValue({ width: 800, height: 1000 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    })),
  };
}

beforeEach(() => {
  vi.mocked(pdfjsMock.getDocument).mockReturnValue({
    promise: Promise.resolve(makeMockPdf(2)),
  } as ReturnType<typeof pdfjsMock.getDocument>);
});

describe("renderPdfPages", () => {
  it("renders one canvas per page", async () => {
    vi.mocked(pdfjsMock.getDocument).mockReturnValue({
      promise: Promise.resolve(makeMockPdf(3)),
    } as ReturnType<typeof pdfjsMock.getDocument>);

    const container = document.createElement("div");
    await renderPdfPages(new ArrayBuffer(0), container);

    expect(container.querySelectorAll("canvas")).toHaveLength(3);
  });

  it("wraps each canvas in a pdf-page-wrapper div", async () => {
    const container = document.createElement("div");
    await renderPdfPages(new ArrayBuffer(0), container);

    const wrappers = container.querySelectorAll(".pdf-page-wrapper");
    expect(wrappers).toHaveLength(2);
    for (const w of wrappers) {
      expect(w.querySelector("canvas")).toBeTruthy();
    }
  });

  it("clears the container before rendering", async () => {
    const container = document.createElement("div");
    container.innerHTML = "<p>stale content</p>";

    await renderPdfPages(new ArrayBuffer(0), container);

    expect(container.querySelector("p")).toBeNull();
  });

  it("removes the progress indicator after all pages render", async () => {
    vi.mocked(pdfjsMock.getDocument).mockReturnValue({
      promise: Promise.resolve(makeMockPdf(3)),
    } as ReturnType<typeof pdfjsMock.getDocument>);

    const container = document.createElement("div");
    await renderPdfPages(new ArrayBuffer(0), container);

    expect(container.querySelector(".pdf-progress")).toBeNull();
  });

  it("does not show a progress indicator for single-page PDFs", async () => {
    vi.mocked(pdfjsMock.getDocument).mockReturnValue({
      promise: Promise.resolve(makeMockPdf(1)),
    } as ReturnType<typeof pdfjsMock.getDocument>);

    const container = document.createElement("div");
    await renderPdfPages(new ArrayBuffer(0), container);

    expect(container.querySelector(".pdf-progress")).toBeNull();
    expect(container.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("stops rendering when the abort signal is already set", async () => {
    vi.mocked(pdfjsMock.getDocument).mockReturnValue({
      promise: Promise.resolve(makeMockPdf(3)),
    } as ReturnType<typeof pdfjsMock.getDocument>);

    const controller = new AbortController();
    controller.abort();

    const container = document.createElement("div");
    await renderPdfPages(new ArrayBuffer(0), container, controller.signal);

    expect(container.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("passes a copy of the buffer to getDocument, keeping the original usable", async () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const container = document.createElement("div");
    await renderPdfPages(buffer, container);

    const passed = vi.mocked(pdfjsMock.getDocument).mock.lastCall![0] as {
      data: ArrayBuffer;
    };
    expect(passed.data).not.toBe(buffer);
    expect(new Uint8Array(passed.data)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });
});
