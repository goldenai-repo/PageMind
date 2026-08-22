import { describe, it, expect, vi } from "vitest";
import { mountTxtReader, splitIntoSections } from "@/lib/readers/txt";

describe("splitIntoSections", () => {
  it("keeps small texts as a single section", () => {
    expect(splitIntoSections("short text", 5000)).toEqual(["short text"]);
  });

  it("splits large texts without losing content", () => {
    const para = "lorem ipsum dolor sit amet ".repeat(20) + "\n\n";
    const text = para.repeat(30);
    const sections = splitIntoSections(text, 5000);

    expect(sections.length).toBeGreaterThan(1);
    expect(sections.join("")).toBe(text);
  });

  it("prefers splitting at paragraph breaks", () => {
    const para = "x".repeat(400) + "\n\n";
    const text = para.repeat(10);
    const sections = splitIntoSections(text, 1000);

    for (const s of sections.slice(0, -1)) {
      expect(s.endsWith("\n\n")).toBe(true);
    }
  });
});

describe("mountTxtReader", () => {
  it("renders the text inside a fixed page card", () => {
    const contentEl = document.createElement("div");
    mountTxtReader({ text: "Hello world", contentEl, fontSize: 18 });

    const page = contentEl.querySelector(".reader-txt");
    expect(page).toBeTruthy();
    expect(page!.textContent).toBe("Hello world");
  });

  it("applies the initial font size to the pager", () => {
    const contentEl = document.createElement("div");
    mountTxtReader({ text: "x", contentEl, fontSize: 20 });

    const pager = contentEl.querySelector(
      ".reader-txt > div > div",
    ) as HTMLElement;
    expect(pager.style.fontSize).toBe("20px");
  });

  it("reports nav state on mount (single page in jsdom)", () => {
    const onNavChange = vi.fn();
    mountTxtReader({
      text: "abc",
      contentEl: document.createElement("div"),
      fontSize: 18,
      onNavChange,
    });

    expect(onNavChange).toHaveBeenLastCalledWith({
      canPrev: false,
      canNext: false,
      pageLabel: "Page 1 of 1",
    });
  });

  it("themes.fontSize updates the pager font size", () => {
    const contentEl = document.createElement("div");
    const rendition = mountTxtReader({ text: "x", contentEl, fontSize: 18 });

    rendition.themes.fontSize("24px");

    const pager = contentEl.querySelector(
      ".reader-txt > div > div",
    ) as HTMLElement;
    expect(pager.style.fontSize).toBe("24px");
  });

  it("navigates across sections with next() and prev()", () => {
    // Each section is a single page in jsdom, so next() crosses sections
    const text = "a".repeat(300) + "\n\n" + "b".repeat(300);
    const onNavChange = vi.fn();
    const rendition = mountTxtReader({
      text,
      contentEl: document.createElement("div"),
      fontSize: 18,
      onNavChange,
      sectionSize: 200,
    });

    expect(onNavChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ canPrev: false, canNext: true }),
    );

    void rendition.next();
    expect(onNavChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canPrev: true,
        pageLabel: expect.stringMatching(/^Page \d+ of \d+$/),
      }),
    );

    void rendition.prev();
    expect(onNavChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ canPrev: false }),
    );
  });

  it("always emits a Contents sidebar, using Start when there are no headings", () => {
    const onToc = vi.fn();
    mountTxtReader({
      text: "a".repeat(500) + "\n\n" + "b".repeat(500),
      contentEl: document.createElement("div"),
      fontSize: 18,
      onToc,
      sectionSize: 200,
    });
    expect(onToc).toHaveBeenCalledWith([
      expect.objectContaining({ id: "start", label: "Start" }),
    ]);
  });

  it("uses stored chapters instead of re-scanning the text", () => {
    const onToc = vi.fn();
    mountTxtReader({
      text: "Chapter 1 Dawn\nhello\n\nChapter 2 Dusk\nbye\n",
      contentEl: document.createElement("div"),
      fontSize: 18,
      onToc,
      chapters: [],
    });
    expect(onToc).toHaveBeenCalledWith([
      expect.objectContaining({ id: "start", label: "Start" }),
    ]);
  });

  it("emits a Contents sidebar for real Chapter headings", () => {
    const onToc = vi.fn();
    mountTxtReader({
      text: "Chapter 1 Dawn\nhello\n\nChapter 2 Dusk\nbye\n",
      contentEl: document.createElement("div"),
      fontSize: 18,
      onToc,
    });
    const items = onToc.mock.calls.at(-1)?.[0] as { label: string }[];
    expect(items).toEqual([
      expect.objectContaining({ id: "ch-0", label: "Chapter 1 Dawn" }),
      expect.objectContaining({ id: "ch-1", label: "Chapter 2 Dusk" }),
    ]);
  });

  it("destroy() is safe to call", () => {
    const rendition = mountTxtReader({
      text: "x",
      contentEl: document.createElement("div"),
      fontSize: 18,
    });

    expect(() => rendition.destroy()).not.toThrow();
  });
});
