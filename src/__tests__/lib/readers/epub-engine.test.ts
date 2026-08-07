import { describe, it, expect, vi, beforeEach } from "vitest";
import { mountEpubReader, CHAPTER_LABEL_RE } from "@/lib/readers/epub-engine";
import JSZip from "jszip";

// Shared mutable store so the vi.mock factory can reference it after hoisting
const mockZip = vi.hoisted(() => ({ files: {} as Record<string, string> }));

vi.mock("jszip", () => ({
  default: {
    loadAsync: vi.fn().mockImplementation(async () => ({
      file: (path: string) => {
        const content = mockZip.files[path];
        if (content === undefined) return null;
        return {
          async: (type: string) => {
            if (type === "blob") return Promise.resolve(new Blob([content]));
            return Promise.resolve(content);
          },
        };
      },
    })),
  },
}));

// Minimal two-chapter EPUB file set
const BASE_EPUB: Record<string, string> = {
  "META-INF/container.xml": `<?xml version="1.0"?><container><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  "content.opf": `<?xml version="1.0"?><package>
    <manifest>
      <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
      <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    </manifest>
    <spine>
      <itemref idref="ch1"/>
      <itemref idref="ch2"/>
    </spine>
  </package>`,
  "ch1.xhtml":
    "<html><body><h1>Chapter One</h1><p>Hello.</p></body></html>",
  "ch2.xhtml":
    "<html><body><h1>Chapter Two</h1><p>Goodbye.</p></body></html>",
};

function makeFile() {
  return new File([""], "book.epub", { type: "application/epub+zip" });
}

describe("CHAPTER_LABEL_RE", () => {
  it.each([
    "chapter",
    "Chapter",
    "chapter 1",
    "Part II",
    "Section 3",
    "Introduction",
    "Preface",
    "Prologue",
    "Epilogue",
    "Appendix A",
    "Conclusion",
    "Afterword",
    "Book 1",
    "Volume 2",
  ])('matches "%s"', (label) => {
    expect(CHAPTER_LABEL_RE.test(label)).toBe(true);
  });

  it.each(["The Great Adventure", "My Story", "About the Author", ""])(
    'does not match "%s"',
    (label) => {
      expect(CHAPTER_LABEL_RE.test(label)).toBe(false);
    },
  );
});

describe("mountEpubReader", () => {
  let contentEl: HTMLDivElement;

  beforeEach(() => {
    mockZip.files = { ...BASE_EPUB };
    contentEl = document.createElement("div");
    vi.clearAllMocks();
  });

  it("adds is-epub class to contentEl and creates the viewer element", async () => {
    await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
    });

    expect(contentEl.classList.contains("is-epub")).toBe(true);
    expect(contentEl.querySelector("#epub-viewer")).toBeTruthy();
  });

  it("applies the initial font size to the viewer", async () => {
    await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 20,
    });

    const viewer = contentEl.querySelector("#epub-viewer") as HTMLElement;
    expect(viewer.style.fontSize).toBe("20px");
  });

  it("returns a rendition with prev, next, destroy, and themes.fontSize", async () => {
    const rendition = await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
    });

    expect(typeof rendition.prev).toBe("function");
    expect(typeof rendition.next).toBe("function");
    expect(typeof rendition.destroy).toBe("function");
    expect(typeof rendition.themes.fontSize).toBe("function");
  });

  it("calls onNavChange with canPrev=false and canNext=true at the first chapter", async () => {
    const onNavChange = vi.fn();

    await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
      onNavChange,
    });

    expect(onNavChange).toHaveBeenLastCalledWith({
      canPrev: false,
      canNext: true,
      pageLabel: expect.any(String),
    });
  });

  it("updates fontSize on the viewer via themes.fontSize", async () => {
    const rendition = await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
    });

    rendition.themes.fontSize("28px");

    const viewer = contentEl.querySelector("#epub-viewer") as HTMLElement;
    expect(viewer.style.fontSize).toBe("28px");
  });

  it("advances to the last chapter and reports canPrev=true, canNext=false", async () => {
    const onNavChange = vi.fn();

    const rendition = await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
      onNavChange,
    });

    onNavChange.mockClear();
    await rendition.next();

    expect(onNavChange).toHaveBeenCalledWith({
      canPrev: true,
      canNext: false,
      pageLabel: expect.any(String),
    });
  });

  it("destroy revokes all cached image blob URLs", async () => {
    mockZip.files = {
      ...BASE_EPUB,
      "content.opf": `<?xml version="1.0"?><package>
        <manifest>
          <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          <item id="img" href="cover.jpg" media-type="image/jpeg"/>
        </manifest>
        <spine><itemref idref="ch1"/></spine>
      </package>`,
      "ch1.xhtml":
        '<html><body><img src="cover.jpg"/><p>Hello.</p></body></html>',
      "cover.jpg": "fake-image-bytes",
    };

    const rendition = await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
    });

    rendition.destroy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });

  it("merges consecutive TOC entries when the first label matches CHAPTER_LABEL_RE and both share the same file", async () => {
    mockZip.files = {
      ...BASE_EPUB,
      "content.opf": `<?xml version="1.0"?><package>
        <manifest>
          <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        </manifest>
        <spine><itemref idref="ch1"/></spine>
      </package>`,
      "toc.ncx": `<?xml version="1.0"?><ncx><navMap>
        <navPoint><navLabel><text>Chapter</text></navLabel><content src="ch1.xhtml#s1"/></navPoint>
        <navPoint><navLabel><text>The Great Beginning</text></navLabel><content src="ch1.xhtml#s2"/></navPoint>
      </navMap></ncx>`,
    };

    const onToc = vi.fn();
    await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
      onToc,
    });

    const items = onToc.mock.calls.at(-1)?.[0] as { label: string }[];
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("Chapter: The Great Beginning");
  });

  it("does not merge TOC entries when labels are on different files", async () => {
    mockZip.files = {
      ...BASE_EPUB,
      "content.opf": `<?xml version="1.0"?><package>
        <manifest>
          <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
          <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
          <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        </manifest>
        <spine><itemref idref="ch1"/><itemref idref="ch2"/></spine>
      </package>`,
      "toc.ncx": `<?xml version="1.0"?><ncx><navMap>
        <navPoint><navLabel><text>Chapter</text></navLabel><content src="ch1.xhtml"/></navPoint>
        <navPoint><navLabel><text>Another Chapter</text></navLabel><content src="ch2.xhtml"/></navPoint>
      </navMap></ncx>`,
    };

    const onToc = vi.fn();
    await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
      onToc,
    });

    const items = onToc.mock.calls.at(-1)?.[0] as unknown[];
    expect(items).toHaveLength(2);
  });

  it("emits an empty TOC when the NCX is absent", async () => {
    const onToc = vi.fn();

    await mountEpubReader({
      file: makeFile(),
      contentEl,
      fontSize: 18,
      onToc,
    });

    // BASE_EPUB has no NCX → no TOC entries
    expect(onToc).toHaveBeenCalledWith([]);
  });

  it("throws when the ZIP cannot be parsed", async () => {
    vi.mocked(JSZip.loadAsync).mockRejectedValueOnce(
      new Error("not a zip file"),
    );

    await expect(
      mountEpubReader({ file: makeFile(), contentEl, fontSize: 18 }),
    ).rejects.toThrow("Cannot unzip");
  });

  it("throws when container.xml has no OPF path", async () => {
    mockZip.files["META-INF/container.xml"] =
      '<?xml version="1.0"?><container/>';

    await expect(
      mountEpubReader({ file: makeFile(), contentEl, fontSize: 18 }),
    ).rejects.toThrow("missing OPF path");
  });

  it("throws when the spine contains no XHTML items", async () => {
    mockZip.files["content.opf"] = `<?xml version="1.0"?><package>
      <manifest/>
      <spine/>
    </package>`;

    await expect(
      mountEpubReader({ file: makeFile(), contentEl, fontSize: 18 }),
    ).rejects.toThrow("No readable XHTML content");
  });
});
