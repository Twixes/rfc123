import { describe, expect, it } from "vitest";
import { formatUnifiedDiff } from "./unified-diff";

describe("formatUnifiedDiff", () => {
  it("formats added and removed lines", () => {
    const diff = formatUnifiedDiff("alpha\nbeta", "alpha\ngamma", {
      path: "docs/rfc.md",
    });
    expect(diff).toContain("--- a/docs/rfc.md");
    expect(diff).toContain("+++ b/docs/rfc.md");
    expect(diff).toContain(" alpha");
    expect(diff).toContain("-beta");
    expect(diff).toContain("+gamma");
  });

  it("truncates very large diffs", () => {
    const before = Array.from(
      { length: 400 },
      (_, i) => `old line ${i} ${"x".repeat(30)}`,
    ).join("\n");
    const after = Array.from(
      { length: 400 },
      (_, i) => `new line ${i} ${"y".repeat(30)}`,
    ).join("\n");
    const diff = formatUnifiedDiff(before, after, { maxChars: 500 });
    expect(diff.length).toBeLessThanOrEqual(500 + 20);
    expect(diff).toContain("diff truncated");
  });

  it("degrades to a coarse summary when the change is too large to diff", () => {
    const before = "x\n".repeat(10_000);
    const after = "y\n".repeat(10_000);
    const diff = formatUnifiedDiff(before, after);
    expect(diff).toContain("diff too large to compute");
    expect(diff).toContain("10001 lines before");
  });
});
