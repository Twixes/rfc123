import { describe, expect, it } from "vitest";
import { commonAffixes } from "./codemirror-diff";

describe("commonAffixes", () => {
  it("returns zero for fully distinct strings", () => {
    expect(commonAffixes("abc", "xyz")).toEqual({ prefix: 0, suffix: 0 });
  });

  it("identifies a shared prefix", () => {
    expect(commonAffixes("hello world", "hello there")).toEqual({
      prefix: 6,
      suffix: 0,
    });
  });

  it("identifies a shared suffix", () => {
    expect(commonAffixes("foo end", "bar end")).toEqual({
      prefix: 0,
      suffix: 4,
    });
  });

  it("handles equal strings", () => {
    expect(commonAffixes("same", "same")).toEqual({ prefix: 4, suffix: 0 });
  });

  it("does not let prefix and suffix overlap", () => {
    // "ab" — both strings — the trim should not double-count.
    const { prefix, suffix } = commonAffixes("ab", "ab");
    expect(prefix + suffix).toBeLessThanOrEqual("ab".length);
  });

  it("isolates a single-character mid-doc edit", () => {
    const a = "The quick brown fox jumps over the lazy dog.";
    const b = "The quick brown FOX jumps over the lazy dog.";
    const { prefix, suffix } = commonAffixes(a, b);
    expect(a.slice(prefix, a.length - suffix)).toBe("fox");
    expect(b.slice(prefix, b.length - suffix)).toBe("FOX");
  });
});
