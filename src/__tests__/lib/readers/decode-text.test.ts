import { describe, it, expect } from "vitest";
import { decodeText } from "@/lib/readers/decode-text";

const bytes = (...b: number[]) => new Uint8Array(b).buffer;

describe("decodeText", () => {
  it("decodes plain ASCII", () => {
    const buf = new TextEncoder().encode("Hello, world!").buffer;
    expect(decodeText(buf)).toBe("Hello, world!");
  });

  it("decodes UTF-8 Chinese", () => {
    const buf = new TextEncoder().encode("你好世界").buffer;
    expect(decodeText(buf)).toBe("你好世界");
  });

  it("decodes GBK/GB18030 Chinese (the mojibake case)", () => {
    // "你好，世界！" encoded in GBK. A realistic-length passage — a few
    // characters is enough for scoring to pick GB18030 over other CJK codecs.
    // 你=C4E3 好=BAC3 ，=A3AC 世=CAC0 界=BDE7 ！=A3A1
    const gbk = bytes(
      0xc4, 0xe3, 0xba, 0xc3, 0xa3, 0xac, 0xca, 0xc0, 0xbd, 0xe7, 0xa3, 0xa1,
    );
    expect(decodeText(gbk)).toBe("你好，世界！");
  });

  it("honors a UTF-8 BOM", () => {
    const buf = bytes(0xef, 0xbb, 0xbf, 0x68, 0x69); // BOM + "hi"
    expect(decodeText(buf)).toBe("hi");
  });

  it("honors a UTF-16LE BOM", () => {
    const buf = bytes(0xff, 0xfe, 0x68, 0x00, 0x69, 0x00); // BOM + "hi"
    expect(decodeText(buf)).toBe("hi");
  });

  it("does not corrupt valid UTF-8 with high bytes", () => {
    const original = "café — naïve résumé";
    const buf = new TextEncoder().encode(original).buffer;
    expect(decodeText(buf)).toBe(original);
  });

  it("returns an empty string for empty input", () => {
    expect(decodeText(new ArrayBuffer(0))).toBe("");
  });
});
