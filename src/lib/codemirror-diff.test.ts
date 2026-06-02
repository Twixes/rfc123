import { describe, expect, it } from "vitest";
import { collapseRuns, commonAffixes } from "./codemirror-diff";

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

describe("collapseRuns", () => {
  it("leaves clean single-word swaps alone", () => {
    // "the cat sat" -> "the dog sat" — one isolated swap, no run to collapse.
    const out = collapseRuns([
      { value: "the " },
      { removed: true, value: "cat" },
      { added: true, value: "dog" },
      { value: " sat" },
    ]);
    expect(out).toEqual([
      { value: "the " },
      { removed: true, value: "cat" },
      { added: true, value: "dog" },
      { value: " sat" },
    ]);
  });

  it("absorbs short interstitial common chunks into surrounding edits", () => {
    // "cat sat" -> "lion rested" — the single-space common between two
    // separate word swaps gets swallowed so the whole region renders as one
    // widget + one green span.
    const out = collapseRuns([
      { removed: true, value: "cat" },
      { added: true, value: "lion" },
      { value: " " },
      { removed: true, value: "sat" },
      { added: true, value: "rested" },
    ]);
    expect(out).toEqual([
      { removed: true, value: "cat sat" },
      { added: true, value: "lion rested" },
    ]);
  });

  it("does not swallow trailing common context with no edits after it", () => {
    // The trailing " sat" has no more edits ahead, so absorbing it would
    // pull untouched text into the widget. Must stay as common.
    const out = collapseRuns([
      { removed: true, value: "cat" },
      { added: true, value: "dog" },
      { value: " sat" },
    ]);
    expect(out).toEqual([
      { removed: true, value: "cat" },
      { added: true, value: "dog" },
      { value: " sat" },
    ]);
  });

  it("treats sentence-ending punctuation as a hard boundary", () => {
    // Two adjacent sentence rewrites stay separate — the ". " between them
    // is a real semantic divide, not noise.
    const out = collapseRuns([
      { removed: true, value: "cat" },
      { added: true, value: "lion" },
      { value: ". " },
      { removed: true, value: "dog" },
      { added: true, value: "tiger" },
    ]);
    expect(out).toEqual([
      { removed: true, value: "cat" },
      { added: true, value: "lion" },
      { value: ". " },
      { removed: true, value: "dog" },
      { added: true, value: "tiger" },
    ]);
  });

  it("treats paragraph breaks as a hard boundary", () => {
    const out = collapseRuns([
      { removed: true, value: "old" },
      { added: true, value: "new" },
      { value: "\n\n" },
      { removed: true, value: "foo" },
      { added: true, value: "bar" },
    ]);
    expect(out).toEqual([
      { removed: true, value: "old" },
      { added: true, value: "new" },
      { value: "\n\n" },
      { removed: true, value: "foo" },
      { added: true, value: "bar" },
    ]);
  });

  it("splits runs on long common stretches", () => {
    // The 30-char common chunk represents real preserved structure, so the
    // two edits on either side should not be merged.
    const longCommon = " this is preserved text ok ";
    const out = collapseRuns([
      { removed: true, value: "a" },
      { added: true, value: "b" },
      { value: longCommon },
      { removed: true, value: "c" },
      { added: true, value: "d" },
    ]);
    expect(out).toEqual([
      { removed: true, value: "a" },
      { added: true, value: "b" },
      { value: longCommon },
      { removed: true, value: "c" },
      { added: true, value: "d" },
    ]);
  });

  it("collapses a dense word-soup rewrite into one widget + one green span", () => {
    // Mirrors the patchwork pattern from the user's screenshot: scattered
    // short common chunks (spaces, "the", "and") between many small swaps.
    const out = collapseRuns([
      { removed: true, value: "one" },
      { added: true, value: "two" },
      { value: " " },
      { removed: true, value: "small" },
      { added: true, value: "tiny" },
      { value: " and " },
      { removed: true, value: "fast" },
      { added: true, value: "slow" },
    ]);
    expect(out).toEqual([
      { removed: true, value: "one small and fast" },
      { added: true, value: "two tiny and slow" },
    ]);
  });
});
