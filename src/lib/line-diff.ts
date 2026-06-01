/**
 * Minimal line-level LCS diff. Returns a sequence of context / removed / added
 * lines in document order, suitable for unified-diff style rendering.
 *
 * The classic O(n*m) dynamic-programming variant – good enough for RFC-sized
 * markdown (a few thousand lines at most). For larger inputs swap in Myers,
 * but the current use case (editor preview against the saved revision) is
 * always small.
 */
export type LineDiffEntry =
  | { kind: "context"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string };

function lcs(a: string[], b: string[]): number[][] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

export function lineDiff(before: string, after: string): LineDiffEntry[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const dp = lcs(a, b);

  const out: LineDiffEntry[] = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      out.push({ kind: "context", text: a[i - 1] });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      out.push({ kind: "removed", text: a[i - 1] });
      i--;
    } else {
      out.push({ kind: "added", text: b[j - 1] });
      j--;
    }
  }
  while (i > 0) {
    out.push({ kind: "removed", text: a[--i] });
  }
  while (j > 0) {
    out.push({ kind: "added", text: b[--j] });
  }
  return out.reverse();
}

/**
 * For every 1-based line in `before`, return the 1-based line number it now
 * occupies in `after`, or `null` when that line was deleted/changed. Lines that
 * appear only in `after` are not represented in the map.
 *
 * Uses the same LCS table as `lineDiff` and walks the backtrace to pick a
 * matching pair for each kept original line. Identical lines that recur are
 * matched in document order so anchors don't "jump" across duplicates.
 */
export function mapOriginalLines(
  before: string,
  after: string,
): Map<number, number | null> {
  const a = before.split("\n");
  // Identity short-circuit — the common case at the start of an edit, and
  // worth skipping the O(n*m) DP allocation entirely.
  if (before === after) {
    const mapping = new Map<number, number | null>();
    for (let k = 1; k <= a.length; k++) mapping.set(k, k);
    return mapping;
  }
  const b = after.split("\n");
  const dp = lcs(a, b);

  const mapping = new Map<number, number | null>();
  for (let k = 1; k <= a.length; k++) mapping.set(k, null);

  let i = a.length;
  let j = b.length;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      mapping.set(i, j);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return mapping;
}
