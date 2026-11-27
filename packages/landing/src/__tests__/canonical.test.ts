import { describe, it, expect } from "vitest";
import { canonicalRedirect } from "../canonical";

describe("canonicalRedirect", () => {
  it("drops trailing slashes", () => {
    expect(canonicalRedirect("/terms/")).toBe("/terms");
    expect(canonicalRedirect("/terms///")).toBe("/terms");
    expect(canonicalRedirect("/a/b/")).toBe("/a/b");
  });

  it("leaves canonical paths alone", () => {
    expect(canonicalRedirect("/")).toBeNull();
    expect(canonicalRedirect("/terms")).toBeNull();
    expect(canonicalRedirect("")).toBeNull();
  });

  it("never points at another host", () => {
    for (const evil of ["//evil.example/x/", "//evil%2Ecom/", "/\\evil.com/x/", "/\\/evil.com/", "///evil.com/", "\\\\evil.com/"]) {
      const target = canonicalRedirect(evil)!;
      expect(target.startsWith("/")).toBe(true);
      expect(target[1]).not.toBe("/");
      expect(target[1]).not.toBe("\\");
      // Resolved the way a browser does, it stays on this site.
      expect(new URL(target, "https://track.alfredo.re").host).toBe("track.alfredo.re");
    }
    expect(canonicalRedirect("//evil.example/x/")).toBe("/evil.example/x");
    expect(canonicalRedirect("////")).toBe("/");
  });

  it("handles long runs of slashes quickly", () => {
    const started = Date.now();
    expect(canonicalRedirect("/".repeat(100000))).toBe("/");
    expect(canonicalRedirect("/a" + "/".repeat(100000) + "b/")).toBe("/a" + "/".repeat(100000) + "b");
    expect(Date.now() - started).toBeLessThan(50);
  });
});
