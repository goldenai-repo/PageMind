import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountPdfReader } from "@/lib/readers/pdf";
import * as pdfjsMock from "pdfjs-dist";

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

function mockDoc(numPages: number) {
  const doc = {
    numPages,
    destroy: vi.fn(),
    getPage: vi.fn().mockImplementation(async () => ({
      getViewport: vi.fn().mockReturnValue({ width: 800, height: 1000 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    })),
  };
  vi.mocked(pdfjsMock.getDocument).mockReturnValue({
    promise: Promise.resolve(doc),
  } as unknown as ReturnType<typeof pdfjsMock.getDocument>);
  return doc;
}

beforeEach(() => {
  vi.mocked(pdfjsMock.getDocument).mockReset();
  mockDoc(3);
});

describe("mountPdfReader", () => {
  it("renders exactly one page canvas inside the page wrapper", async () => {
    const contentEl = document.createElement("div");
    await mountPdfReader({ data: new ArrayBuffer(0), contentEl });

    expect(contentEl.querySelectorAll("canvas")).toHaveLength(1);
    expect(contentEl.querySelector(".pdf-page-wrapper")).toBeTruthy();
  });

  it("reports nav state for the first page", async () => {
    const onNavChange = vi.fn();
    const contentEl = document.createElement("div");
    await mountPdfReader({ data: new ArrayBuffer(0), contentEl, onNavChange });

    expect(onNavChange).toHaveBeenLastCalledWith({
      canPrev: false,
      canNext: true,
      pageLabel: "Page 1 of 3",
    });
  });

  it("next() shows the following page, still as a single canvas", async () => {
    const onNavChange = vi.fn();
    const contentEl = document.createElement("div");
    const rendition = await mountPdfReader({
      data: new ArrayBuffer(0),
      contentEl,
      onNavChange,
    });

    await rendition.next();

    expect(onNavChange).toHaveBeenLastCalledWith({
      canPrev: true,
      canNext: true,
      pageLabel: "Page 2 of 3",
    });
    expect(contentEl.querySelectorAll("canvas")).toHaveLength(1);
  });

  it("prev() and next() are no-ops at the bounds", async () => {
    mockDoc(1);
    const onNavChange = vi.fn();
    const contentEl = document.createElement("div");
    const rendition = await mountPdfReader({
      data: new ArrayBuffer(0),
      contentEl,
      onNavChange,
    });

    onNavChange.mockClear();
    await rendition.prev();
    await rendition.next();

    expect(onNavChange).not.toHaveBeenCalled();
  });

  it("does not render when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const contentEl = document.createElement("div");
    await mountPdfReader({
      data: new ArrayBuffer(0),
      contentEl,
      signal: controller.signal,
    });

    expect(contentEl.querySelectorAll("canvas")).toHaveLength(0);
  });

  it("passes a copy of the buffer to getDocument, keeping the original usable", async () => {
    const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
    const contentEl = document.createElement("div");
    await mountPdfReader({ data: buffer, contentEl });

    const passed = vi.mocked(pdfjsMock.getDocument).mock.lastCall![0] as {
      data: ArrayBuffer;
    };
    expect(passed.data).not.toBe(buffer);
    expect(new Uint8Array(passed.data)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("destroy() destroys the pdf document", async () => {
    const doc = mockDoc(2);
    const contentEl = document.createElement("div");
    const rendition = await mountPdfReader({
      data: new ArrayBuffer(0),
      contentEl,
    });

    rendition.destroy();

    expect(doc.destroy).toHaveBeenCalled();
  });
});
