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
        pageLabel: expect.stringContaining("Part 2/"),
      }),
    );

    void rendition.prev();
    expect(onNavChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ canPrev: false }),
    );
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
