import { describe, it, expect } from "vitest";
import { isolateCss } from "@/lib/readers/css-scope";

describe("isolateCss", () => {
  it("wraps rules in @scope so they cannot restyle the app chrome", () => {
    const out = isolateCss(
      "ul { padding: 0 } li { margin: 0 } * { box-sizing: border-box }",
      ".pm-flow-epub",
    );
    expect(out.startsWith("@scope (.pm-flow-epub)")).toBe(true);
    expect(out).toContain("ul { padding: 0 }");
  });

  it("rewrites html/body selectors onto the scoped root", () => {
    const out = isolateCss(
      "body, p, div, span, li { font-size: 8px } html { margin: 0 }",
      ".pm-flow-epub",
    );
    expect(out).toContain(":scope, p, div, span, li");
    expect(out).toContain(":scope { margin: 0 }");
    expect(out).not.toMatch(/(^|[^{])\bbody\b/);
  });
});
