import { Decoration } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import {
  buildDiffDecorations,
  collapseRuns,
  commonAffixes,
} from "./codemirror-diff";

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

describe("buildDiffDecorations precision under load", () => {
  // Regression test for the bug where a tiny edit in a multi-paragraph doc
  // with many other accumulated edits used to fall through to a coarse
  // per-line fallback and highlight the entire paragraph. Paragraph-aware
  // splitting keeps each paragraph's diff independent and word-precise.
  function decorationRanges(
    set: ReturnType<typeof buildDiffDecorations>,
  ): { from: number; to: number; isWidget: boolean }[] {
    const out: { from: number; to: number; isWidget: boolean }[] = [];
    const cursor = set.iter();
    while (cursor.value) {
      const spec = (cursor.value as unknown as { spec?: { widget?: unknown } })
        .spec;
      out.push({
        from: cursor.from,
        to: cursor.to,
        isWidget: !!spec?.widget,
      });
      cursor.next();
    }
    return out;
  }

  it("highlights only the changed word when accumulated edits push past the bailout", () => {
    // 300 paragraphs of substantial prose — guarantees the saved-revision
    // diff exceeds the per-cluster maxEditLength if anything coarse-grained
    // is invoked. Two scattered prior edits + one new char in paragraph 150.
    const para = (n: number) =>
      `Paragraph ${n} of the document. It contains several sentences that are completely unique to this index ${n}. The point is to have enough characters that a per-paragraph diff is meaningful, and to ensure paragraphs do not look alike across the document.`;
    const original = Array.from({ length: 300 }, (_, i) => para(i)).join(
      "\n\n",
    );
    let current = original;
    // Two big prior edits elsewhere — these blow up the cumulative edit
    // distance so a non-paragraph-aware diff would bail.
    current = current.replace(para(50), `${para(50)} EXTRA SENTENCE A.`);
    current = current.replace(para(250), `${para(250)} EXTRA SENTENCE B.`);
    // The change we care about: one character flipped inside paragraph 150.
    current = current.replace("Paragraph 150 of", "Paragraph 150 oF");

    const set = buildDiffDecorations(original, current);
    expect(set).not.toBe(Decoration.none);

    const ranges = decorationRanges(set);
    // Decoration ranges should be small — none should span an entire
    // paragraph's worth of characters. para().length ≈ 270; if any single
    // green mark or removed widget approached that, we'd be back in
    // whole-paragraph land.
    const widestSpan = ranges.reduce((m, r) => Math.max(m, r.to - r.from), 0);
    expect(widestSpan).toBeLessThan(40);

    // And the green-mark count should be ≥ 3 (one per scattered edit) —
    // proves we didn't collapse all three into one giant region.
    const greenMarks = ranges.filter((r) => !r.isWidget);
    expect(greenMarks.length).toBeGreaterThanOrEqual(3);
  });
});
