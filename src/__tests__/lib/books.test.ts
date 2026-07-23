import { describe, it, expect } from "vitest";
import {
  formatSize,
  formatDate,
  COVERS,
  computeProgressPercent,
  computeSectionProgressPercent,
  isInMyLibrary,
  removeFromMyLibrary,
  normalizeLibraryBook,
  type LibraryBook,
} from "@/lib/books";

describe("formatSize", () => {
  it("formats bytes under 1 KB", () => {
    expect(formatSize(0)).toBe("0 B");
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1023)).toBe("1023 B");
  });

  it("formats bytes in the KB range", () => {
    expect(formatSize(1024)).toBe("1.0 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("formats bytes in the MB range", () => {
    expect(formatSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatSize(10 * 1024 * 1024)).toBe("10.0 MB");
  });
});

describe("formatDate", () => {
  it("formats a known date in en-US locale", () => {
    const date = new Date(2024, 0, 15); // Jan 15 2024 (local time)
    expect(formatDate(date)).toBe("Jan 15, 2024");
  });

  it("formats first of month correctly", () => {
    const date = new Date(2023, 11, 1); // Dec 1 2023
    expect(formatDate(date)).toBe("Dec 1, 2023");
  });
});

describe("COVERS", () => {
  it("has 8 gradient presets", () => {
    expect(COVERS).toHaveLength(8);
  });

  it("every cover is a valid CSS linear-gradient string", () => {
    for (const cover of COVERS) {
      expect(cover).toMatch(/^linear-gradient/);
    }
  });
});

describe("computeProgressPercent", () => {
  it("returns 0 for invalid totals", () => {
    expect(computeProgressPercent(5, 0)).toBe(0);
    expect(computeProgressPercent(5, -1)).toBe(0);
  });

  it("rounds page progress to 0–100", () => {
    expect(computeProgressPercent(1, 100)).toBe(1);
    expect(computeProgressPercent(50, 100)).toBe(50);
    expect(computeProgressPercent(92, 100)).toBe(92);
    expect(computeProgressPercent(100, 100)).toBe(100);
    expect(computeProgressPercent(120, 100)).toBe(100);
  });
});

describe("computeSectionProgressPercent", () => {
  it("weights by section and page within section", () => {
    // First of two sections, first of 10 pages → ~5%
    expect(computeSectionProgressPercent(0, 2, 0, 10)).toBe(5);
    // End of first section → 50%
    expect(computeSectionProgressPercent(0, 2, 9, 10)).toBe(50);
    // End of second section → 100%
    expect(computeSectionProgressPercent(1, 2, 9, 10)).toBe(100);
  });
});

describe("library membership helpers", () => {
  const base: LibraryBook = {
    id: "1",
    title: "Demo",
    ext: "pdf",
    cover: COVERS[0],
    size: "1.0 MB",
    addedAt: new Date(),
    data: new ArrayBuffer(8),
  };

  it("normalizeLibraryBook fills Phase 1 defaults", () => {
    const n = normalizeLibraryBook(base);
    expect(n.rating).toBe(0);
    expect(n.progressPercent).toBe(0);
    expect(n.lastReadPage).toBe(0);
    expect(n.locator).toBeNull();
  });

  it("isInMyLibrary respects flags", () => {
    expect(isInMyLibrary(base)).toBe(false);
    expect(isInMyLibrary({ ...base, inMyLibrary: true })).toBe(true);
    expect(isInMyLibrary({ ...base, favorite: true })).toBe(true);
    expect(isInMyLibrary({ ...base, status: "want" })).toBe(true);
  });

  it("removeFromMyLibrary clears membership but keeps the catalog row", () => {
    const removed = removeFromMyLibrary({
      ...base,
      inMyLibrary: true,
      favorite: true,
      status: "finished",
      progressPercent: 40,
    });
    expect(removed.inMyLibrary).toBe(false);
    expect(removed.favorite).toBe(false);
    expect(removed.status).toBeUndefined();
    expect(removed.progressPercent).toBe(40);
    expect(removed.id).toBe("1");
  });
});
