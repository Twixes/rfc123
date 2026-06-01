import { describe, expect, it } from "vitest";
import { lineDiff, mapOriginalLines } from "./line-diff";

describe("lineDiff", () => {
  it("emits context for identical content", () => {
    const out = lineDiff("alpha\nbeta", "alpha\nbeta");
    expect(out).toEqual([
      { kind: "context", text: "alpha" },
      { kind: "context", text: "beta" },
    ]);
  });

  it("marks removed and added lines around context", () => {
    const out = lineDiff("alpha\nbeta\ngamma", "alpha\nGAMMA\ngamma");
    // Order within a hunk is added-before-removed; that's an existing quirk
    // of the LCS backtrace, kept for diff-view rendering compatibility.
    expect(out).toEqual([
      { kind: "context", text: "alpha" },
      { kind: "added", text: "GAMMA" },
      { kind: "removed", text: "beta" },
      { kind: "context", text: "gamma" },
    ]);
  });

  it("marks every line as added when before is empty", () => {
    // '' splits to [''], so an empty file vs 'a\nb' produces a removed '' for
    // the empty line plus added entries for both new lines. Pin the shape so
    // a future implementation that special-cases empty inputs doesn't drift.
    const out = lineDiff("", "a\nb");
    expect(out.filter((e) => e.kind === "added").map((e) => e.text)).toEqual([
      "a",
      "b",
    ]);
    expect(out.filter((e) => e.kind === "removed").map((e) => e.text)).toEqual([
      "",
    ]);
  });

  it("marks every line as removed when after is empty", () => {
    const out = lineDiff("a\nb", "");
    expect(out.filter((e) => e.kind === "removed").map((e) => e.text)).toEqual([
      "a",
      "b",
    ]);
    expect(out.filter((e) => e.kind === "added").map((e) => e.text)).toEqual([
      "",
    ]);
  });
});

describe("mapOriginalLines", () => {
  it("maps every line one-to-one when content is unchanged", () => {
    const m = mapOriginalLines("a\nb\nc", "a\nb\nc");
    expect(m.get(1)).toBe(1);
    expect(m.get(2)).toBe(2);
    expect(m.get(3)).toBe(3);
  });

  it("returns an identity map fast-path for identical inputs", () => {
    // The hot path: every keystroke before the user actually edits hits this
    // short-circuit and avoids allocating the O(n*m) LCS table.
    const big = Array.from({ length: 1000 }, (_, i) => `line ${i}`).join("\n");
    const start = performance.now();
    const m = mapOriginalLines(big, big);
    const elapsed = performance.now() - start;
    expect(m.size).toBe(1000);
    expect(m.get(1)).toBe(1);
    expect(m.get(1000)).toBe(1000);
    // The full DP on 1000 lines takes 5-20ms; the short-circuit should be under 5ms.
    expect(elapsed).toBeLessThan(5);
  });

  it("shifts mappings forward when lines are inserted above", () => {
    const m = mapOriginalLines("a\nb\nc", "x\ny\na\nb\nc");
    expect(m.get(1)).toBe(3);
    expect(m.get(2)).toBe(4);
    expect(m.get(3)).toBe(5);
  });

  it("returns null for lines that no longer exist", () => {
    const m = mapOriginalLines("a\nb\nc", "a\nc");
    expect(m.get(1)).toBe(1);
    expect(m.get(2)).toBe(null);
    expect(m.get(3)).toBe(2);
  });

  it("returns null when a line was edited (treated as deleted + added)", () => {
    const m = mapOriginalLines("a\nb\nc", "a\nB\nc");
    expect(m.get(1)).toBe(1);
    expect(m.get(2)).toBe(null);
    expect(m.get(3)).toBe(3);
  });

  it("matches duplicate lines in document order", () => {
    // Both originals "x" should map to *some* "x" in `after`, in order.
    const m = mapOriginalLines("x\nx\ny", "x\nz\nx\ny");
    // First original "x" → first "x" in after (line 1).
    // Second original "x" → second "x" in after (line 3).
    expect(m.get(1)).toBe(1);
    expect(m.get(2)).toBe(3);
    expect(m.get(3)).toBe(4);
  });

  it("returns null entries for every line when after is empty", () => {
    const m = mapOriginalLines("a\nb", "");
    expect(m.get(1)).toBe(null);
    expect(m.get(2)).toBe(null);
    expect(m.size).toBe(2);
  });
});
