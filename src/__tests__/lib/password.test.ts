import { describe, it, expect } from "vitest";
import { scorePassword, STRENGTH } from "@/lib/password";

describe("scorePassword", () => {
  it("returns 0 for an empty string", () => {
    expect(scorePassword("")).toBe(0);
  });

  it("returns 1 (Weak) for a short, all-lowercase password", () => {
    // length < 8, no uppercase, no digits, no special → score 0 → clamped to 1
    expect(scorePassword("abc")).toBe(1);
  });

  it("returns 1 (Weak) for exactly 8 chars, all lowercase", () => {
    // length >= 8 (+1), no uppercase, no digits, no special → score 1 → 1
    expect(scorePassword("password")).toBe(1);
  });

  it("returns 2 (Fair) for a long lowercase-only password", () => {
    // length >= 8 (+1), length >= 12 (+1), no uppercase, no digits → score 2 → 2
    expect(scorePassword("longenoughpassword")).toBe(2);
  });

  it("returns 3 (Good) for a mixed-case password with a digit", () => {
    // >= 8 (+1), mixed case (+1), digit (+1) → score 3 → 3
    expect(scorePassword("Password1")).toBe(3);
  });

  it("returns 4 (Strong) for a password meeting all criteria", () => {
    // >= 8 (+1), >= 12 (+1), mixed case (+1), digit (+1), special (+1) → score 5 → ceil(5/1.25)=4
    expect(scorePassword("Password1!xyz")).toBe(4);
  });

  it("returns 4 (Strong) when score would exceed 4", () => {
    expect(scorePassword("SuperSecure1!Long")).toBe(4);
  });

  it("requires both upper and lower for the mixed-case point", () => {
    // all uppercase → no mixed-case bonus
    expect(scorePassword("ALLCAPS1")).toBe(2); // >= 8, digit → score 2
    // all lowercase → no mixed-case bonus
    expect(scorePassword("alllower1")).toBe(2); // >= 8, digit → score 2
  });
});

describe("STRENGTH", () => {
  it("has 5 entries indexed 0–4", () => {
    expect(STRENGTH).toHaveLength(5);
  });

  it("index 0 represents the empty/no-password state", () => {
    expect(STRENGTH[0].label).toBe("");
    expect(STRENGTH[0].width).toBe("0%");
  });

  it("labels are Weak, Fair, Good, Strong at indices 1–4", () => {
    expect(STRENGTH[1].label).toBe("Weak");
    expect(STRENGTH[2].label).toBe("Fair");
    expect(STRENGTH[3].label).toBe("Good");
    expect(STRENGTH[4].label).toBe("Strong");
  });

  it("widths increase from 25% to 100%", () => {
    expect(STRENGTH[1].width).toBe("25%");
    expect(STRENGTH[4].width).toBe("100%");
  });
});
