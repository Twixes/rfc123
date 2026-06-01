import { describe, expect, it } from "vitest";
import { cascadeBoxes, layoutArrows } from "./inline-comment-layout";

describe("cascadeBoxes", () => {
  it("returns empty positions and zero maxBottom for empty input", () => {
    const result = cascadeBoxes([]);
    expect(result.positions.size).toBe(0);
    expect(result.maxBottom).toBe(0);
  });

  it("returns a single box at its base offset", () => {
    const result = cascadeBoxes([
      { key: 1, sortLine: 1, baseOffset: 50, boxHeight: 80 },
    ]);
    expect(result.positions.get(1)).toBe(50);
    expect(result.maxBottom).toBe(130);
  });

  it("places non-overlapping boxes at their base offset", () => {
    const result = cascadeBoxes([
      { key: 5, sortLine: 5, baseOffset: 100, boxHeight: 40 },
      { key: 12, sortLine: 12, baseOffset: 300, boxHeight: 40 },
    ]);
    expect(result.positions.get(5)).toBe(100);
    expect(result.positions.get(12)).toBe(300);
    expect(result.maxBottom).toBe(340);
  });

  it("pushes the second box down to clear the first plus an 8px gap", () => {
    const result = cascadeBoxes([
      { key: 5, sortLine: 5, baseOffset: 100, boxHeight: 60 },
      { key: 7, sortLine: 7, baseOffset: 120, boxHeight: 40 },
    ]);
    expect(result.positions.get(5)).toBe(100);
    // 100 (top of first) + 60 (height) + 8 (gap) = 168 — past the second's 120
    expect(result.positions.get(7)).toBe(168);
    expect(result.maxBottom).toBe(168 + 40);
  });

  it("sorts by sortLine, not insertion order", () => {
    const result = cascadeBoxes([
      { key: -1, sortLine: 10, baseOffset: 100, boxHeight: 30 },
      { key: 3, sortLine: 3, baseOffset: 50, boxHeight: 30 },
    ]);
    expect(result.positions.get(3)).toBe(50);
    expect(result.positions.get(-1)).toBe(100);
  });

  it("preserves both entries when two boxes share a sortLine", () => {
    // Array.prototype.sort with a comparator returning 0 is stable on V8 (and
    // since ES2019, in spec), so insertion order wins for ties — pin that.
    const result = cascadeBoxes([
      { key: 7, sortLine: 5, baseOffset: 100, boxHeight: 30 },
      { key: 9, sortLine: 5, baseOffset: 100, boxHeight: 30 },
    ]);
    expect(result.positions.get(7)).toBe(100);
    // Second tied box is pushed below the first by box height + 8px gap.
    expect(result.positions.get(9)).toBe(138);
  });
});

describe("layoutArrows", () => {
  it("returns an empty list when no arrows are provided", () => {
    expect(layoutArrows([])).toEqual([]);
  });

  it("places a single arrow's elbow at the midpoint between from and to X", () => {
    const result = layoutArrows([
      {
        lineNumber: 1,
        from: { x: 800, y: 100 },
        to: { x: 600, y: 100 },
        color: "var(--magenta)",
        isDraft: false,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].elbowX).toBe(700);
  });

  it("offsets elbows whose vertical segments would overlap at the same X", () => {
    // Both arrows span y=100..y=200 vertically; same baseElbowX of 700.
    // The second arrow's elbow has to step left by 4px to clear the first.
    const result = layoutArrows([
      {
        lineNumber: 1,
        from: { x: 800, y: 100 },
        to: { x: 600, y: 200 },
        color: "var(--magenta)",
        isDraft: false,
      },
      {
        lineNumber: 2,
        from: { x: 800, y: 110 },
        to: { x: 600, y: 190 },
        color: "var(--magenta)",
        isDraft: false,
      },
    ]);
    const byLine = new Map(result.map((p) => [p.lineNumber, p.elbowX]));
    expect(byLine.get(1)).toBe(700);
    expect(byLine.get(2)).toBe(696);
  });

  it("keeps the same elbow X for arrows whose vertical ranges are disjoint", () => {
    // Arrow A occupies y=100..120; arrow B occupies y=300..320. They don't
    // visually overlap, so both should land at the same averaged elbow X.
    const result = layoutArrows([
      {
        lineNumber: 1,
        from: { x: 800, y: 100 },
        to: { x: 600, y: 120 },
        color: "var(--magenta)",
        isDraft: false,
      },
      {
        lineNumber: 2,
        from: { x: 800, y: 300 },
        to: { x: 600, y: 320 },
        color: "var(--magenta)",
        isDraft: false,
      },
    ]);
    const elbows = result.map((p) => p.elbowX);
    expect(elbows[0]).toBe(elbows[1]);
  });

  it("clamps the elbow at the target X when the sidebar is to the left", () => {
    // Reverse orientation: from.x < to.x. The Math.max guard pins the elbow
    // at to.x because going further right would overshoot.
    const result = layoutArrows([
      {
        lineNumber: 1,
        from: { x: 200, y: 100 },
        to: { x: 400, y: 200 },
        color: "var(--magenta)",
        isDraft: false,
      },
    ]);
    expect(result[0].elbowX).toBe(400);
  });

  it("clamps the elbow at the target X even when many arrows stack", () => {
    const result = layoutArrows(
      Array.from({ length: 50 }, (_, i) => ({
        lineNumber: i + 1,
        from: { x: 800, y: 100 + i },
        to: { x: 600, y: 300 + i },
        color: "var(--magenta)",
        isDraft: false,
      })),
    );
    for (const p of result) {
      expect(p.elbowX).toBeGreaterThanOrEqual(600);
    }
  });
});
