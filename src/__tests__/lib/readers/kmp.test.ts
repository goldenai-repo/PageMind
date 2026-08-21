import { describe, it, expect } from "vitest";
import { buildLps, kmpSearchAll } from "@/lib/readers/kmp";

describe("kmpSearchAll", () => {
  it("finds every occurrence of a pattern", () => {
    expect(kmpSearchAll("ababcab", "ab")).toEqual([0, 2, 5]);
  });

  it("finds overlapping matches via the LPS table", () => {
    expect(kmpSearchAll("aaaa", "aa")).toEqual([0, 1, 2]);
    expect(buildLps("aa")).toEqual([0, 1]);
  });

  it("returns no hits for a missing or empty pattern", () => {
    expect(kmpSearchAll("第一章", "Chapter ")).toEqual([]);
    expect(kmpSearchAll("abc", "")).toEqual([]);
  });

  it("locates Chinese and English chapter prefixes", () => {
    const text = "前言\n第一章 风起\n正文\nChapter 2 Storm\n";
    expect(kmpSearchAll(text, "第")).toEqual([text.indexOf("第")]);
    expect(kmpSearchAll(text, "Chapter ")).toEqual([text.indexOf("Chapter ")]);
  });
});
