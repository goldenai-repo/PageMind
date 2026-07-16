import { describe, it, expect } from "vitest";
import { formatSize, formatDate, COVERS } from "@/lib/books";

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
