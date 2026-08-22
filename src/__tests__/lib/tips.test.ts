// @vitest-environment node
import { describe, expect, it } from "vitest";

import { stripTipText, tipAnchorInText } from "@/lib/tips";
import { spineIndexForHref } from "@/lib/readers/spine-href";

describe("stripTipText", () => {
  it("collapses whitespace so page text can match an authored anchor", () => {
    expect(stripTipText("贝克街  象一座\n火炉")).toBe("贝克街象一座火炉");
  });
});

describe("tipAnchorInText", () => {
  it("matches an exact phrase inside a longer page", () => {
    expect(
      tipAnchorInText(
        "可以找到明显的柯南道尔对前人特别是爱伦﹒坡继承的痕迹。",
        "爱伦﹒坡继承的痕迹",
      ),
    ).toBe(true);
  });

  it("ignores wrapping whitespace in the page", () => {
    expect(
      tipAnchorInText(
        "Always winter\nand never Christmas",
        "Always winter and never Christmas",
      ),
    ).toBe(true);
  });

  it("does not match a phrase that is not on the page", () => {
    expect(
      tipAnchorInText("王冠宝石案 华生回到贝克街", "爱伦﹒坡继承的痕迹"),
    ).toBe(false);
  });
});

describe("spineIndexForHref", () => {
  const spine = ["OPS/chapter1.html", "OPS/chapter19.html"];

  it("matches a full path, a suffix, or a filename", () => {
    expect(spineIndexForHref(spine, "OPS/chapter1.html")).toBe(0);
    expect(spineIndexForHref(spine, "OPS/chapter19.html")).toBe(1);
    expect(spineIndexForHref(spine, "chapter1.html")).toBe(0);
  });

  it("returns -1 when nothing matches", () => {
    expect(spineIndexForHref(spine, "missing.html")).toBe(-1);
  });
});
