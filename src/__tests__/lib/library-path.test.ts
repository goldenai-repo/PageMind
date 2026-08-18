import { describe, expect, it } from "vitest";

import {
  bookIdFromLibraryPath,
  libraryPath,
  parseLibraryShelf,
} from "@/lib/library-path";

describe("parseLibraryShelf", () => {
  it("maps known shelves and treats missing/legacy as home", () => {
    expect(parseLibraryShelf("mine")).toBe("mine");
    expect(parseLibraryShelf("favorite")).toBe("favorite");
    expect(parseLibraryShelf(undefined)).toBe("home");
    expect(parseLibraryShelf("store")).toBe("home");
  });
});

describe("libraryPath", () => {
  it("builds index and per-book URLs", () => {
    expect(libraryPath()).toBe("/library");
    expect(libraryPath("abc-123")).toBe("/library/abc-123");
    expect(libraryPath("abc-123", "mine")).toBe("/library/abc-123");
    expect(libraryPath(null, "mine")).toBe("/library?shelf=mine");
    expect(libraryPath(null, "home")).toBe("/library");
  });
});

describe("bookIdFromLibraryPath", () => {
  it("reads the book id only from /library/{id}", () => {
    expect(bookIdFromLibraryPath("/library")).toBeNull();
    expect(bookIdFromLibraryPath("/library/")).toBeNull();
    expect(bookIdFromLibraryPath("/library/abc-123")).toBe("abc-123");
    expect(bookIdFromLibraryPath("/upload")).toBeNull();
  });
});
