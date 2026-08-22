// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import {
  authorScore,
  buildSearchQueries,
  fetchGoogleBookSummary,
  GoogleBooksError,
  htmlToPlainText,
  pickBestVolume,
  titleScore,
  type GoogleBookVolume,
} from "@/lib/google-books";

describe("buildSearchQueries", () => {
  it("starts with title+author, then title only", () => {
    const q = buildSearchQueries("The Great Gatsby", "F. Scott Fitzgerald");
    expect(q[0]).toBe('intitle:"The Great Gatsby" inauthor:"F. Scott Fitzgerald"');
    expect(q[1]).toBe('intitle:"The Great Gatsby"');
    expect(q.at(-1)).toContain("F. Scott Fitzgerald");
  });

  it("strips quotes from the query parts", () => {
    const q = buildSearchQueries('The "Gatsby"', 'F"itz');
    expect(q[0]).toBe('intitle:"The Gatsby" inauthor:"F itz"');
  });
});

describe("htmlToPlainText", () => {
  it("strips tags and keeps paragraph breaks", () => {
    expect(
      htmlToPlainText("<p>Hello <b>world</b>.</p><br>Next&nbsp;line."),
    ).toBe("Hello world.\n\nNext line.");
  });

  it("decodes entities after tags", () => {
    expect(htmlToPlainText("A &amp; B &#39;C&#39;")).toBe("A & B 'C'");
  });
});

describe("titleScore / authorScore", () => {
  it("scores exact and contained Chinese titles highly", () => {
    expect(titleScore("福尔摩斯探案全集", "福尔摩斯探案全集")).toBe(100);
    expect(titleScore("福尔摩斯探案全集", "福尔摩斯探案全集（全译）")).toBeGreaterThanOrEqual(70);
  });

  it("rejects unrelated titles", () => {
    expect(titleScore("The Great Gatsby", "Pride and Prejudice")).toBeLessThan(50);
  });

  it("matches overlapping author names", () => {
    expect(authorScore("Arthur Conan Doyle", ["Sir Arthur Conan Doyle"])).toBe(40);
    expect(authorScore("柯南道尔", ["Arthur Conan Doyle"])).toBe(0);
  });
});

describe("pickBestVolume", () => {
  const holmes: GoogleBookVolume = {
    id: "holmes",
    volumeInfo: {
      title: "福尔摩斯探案全集",
      authors: ["Arthur Conan Doyle"],
      description: "<p>A classic detective collection.</p>",
      infoLink: "https://books.google.com/holmes",
    },
  };
  const wrong: GoogleBookVolume = {
    id: "wrong",
    volumeInfo: {
      title: "Cooking with Holmes",
      authors: ["Someone Else"],
      description: "<p>Recipes.</p>",
    },
  };
  const noDesc: GoogleBookVolume = {
    id: "nodesc",
    volumeInfo: {
      title: "福尔摩斯探案全集",
      authors: ["Arthur Conan Doyle"],
    },
  };

  it("picks the matching volume with a description", () => {
    const picked = pickBestVolume([wrong, noDesc, holmes], "福尔摩斯探案全集", "柯南道尔");
    expect(picked?.id).toBe("holmes");
  });

  it("returns null when nothing has a usable description", () => {
    expect(pickBestVolume([noDesc], "福尔摩斯探案全集")).toBeNull();
  });
});

describe("fetchGoogleBookSummary", () => {
  it("walks fallback queries until a described match appears", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ totalItems: 0, items: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          totalItems: 1,
          items: [
            {
              id: "gatsby",
              volumeInfo: {
                title: "The Great Gatsby",
                authors: ["F. Scott Fitzgerald"],
                description: "<p>Jay Gatsby and Daisy Buchanan.</p>",
                infoLink: "https://books.google.com/gatsby",
              },
            },
          ],
        }),
      });

    const result = await fetchGoogleBookSummary(
      { title: "The Great Gatsby", author: "F. Scott Fitzgerald" },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result?.text).toBe("Jay Gatsby and Daisy Buchanan.");
    expect(result?.infoLink).toContain("gatsby");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("throws GoogleBooksError on quota exhaustion", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Quota exceeded" } }),
    });
    await expect(
      fetchGoogleBookSummary({ title: "Dune" }, fetchImpl as unknown as typeof fetch),
    ).rejects.toMatchObject({ name: "GoogleBooksError", status: 429 });
  });
});
