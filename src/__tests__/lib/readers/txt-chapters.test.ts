import { describe, it, expect } from "vitest";
import { detectTxtChapters } from "@/lib/readers/txt-chapters";

describe("detectTxtChapters", () => {
  it("detects English Chapter headings and keeps the chapter name", () => {
    const text = [
      "Prologue text.",
      "",
      "Chapter 1: The Beginning",
      "Once upon a time.",
      "",
      "Chapter 2 The Storm",
      "It rained.",
    ].join("\n");

    const hits = detectTxtChapters(text);
    expect(hits.map((h) => h.label)).toEqual([
      "Chapter 1 The Beginning",
      "Chapter 2 The Storm",
    ]);
    expect(text.slice(hits[0].start).startsWith("Chapter 1")).toBe(true);
  });

  it("detects 第N章 headings and uses the heading line as the label", () => {
    const text = [
      "楔子",
      "第一章 风雪夜归人",
      "山路十八弯。",
      "第二章",
      "天亮了。",
    ].join("\n");

    const hits = detectTxtChapters(text);
    expect(hits.map((h) => h.label)).toEqual([
      "楔子",
      "第一章 风雪夜归人",
      "第二章",
    ]);
  });

  it("uses KMP hits so a front 目录 listing does not steal the real chapter", () => {
    const listing = "目录\n第一章 开始\n第二章 结束\n";
    const body = "\n正文\n第一章 开始\n故事开始了。\n第二章 结束\n故事结束了。\n";
    const text = listing + body;
    const hits = detectTxtChapters(text);
    expect(hits.map((h) => h.label)).toEqual(["第一章 开始", "第二章 结束"]);
    expect(hits[0].start).toBe(text.lastIndexOf("第一章 开始"));
  });

  it("detects markdown headings", () => {
    const text = "# Opening\nhello\n\n## The Road\nworld\n";
    expect(detectTxtChapters(text).map((h) => h.label)).toEqual([
      "Opening",
      "The Road",
    ]);
  });

  it("ignores mid-sentence 第 but keeps a single heading", () => {
    expect(detectTxtChapters("他第一次见到她。")).toEqual([]);
    expect(
      detectTxtChapters("Chapter 1 Only one heading\njust text").map(
        (h) => h.label,
      ),
    ).toEqual(["Chapter 1 Only one heading"]);
  });

  it("detects 正文 第N回 headings used by classic novels", () => {
    const text = [
      "《三国演义》",
      "",
      "正文 第一回 宴桃园豪杰三结义 斩黄巾英雄首立功",
      "滚滚长江东逝水，浪花淘尽英雄。",
      "",
      "正文 第二回 张翼德怒鞭督邮 何国舅谋诛宦竖",
      "建宁二年四月望日。",
    ].join("\n");

    expect(detectTxtChapters(text).map((h) => h.label)).toEqual([
      "第一回 宴桃园豪杰三结义 斩黄巾英雄首立功",
      "第二回 张翼德怒鞭督邮 何国舅谋诛宦竖",
    ]);
  });
});
