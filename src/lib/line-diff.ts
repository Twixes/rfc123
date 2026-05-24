/**
 * Minimal line-level LCS diff. Returns a sequence of context / removed / added
 * lines in document order, suitable for unified-diff style rendering.
 *
 * The classic O(n*m) dynamic-programming variant — good enough for RFC-sized
 * markdown (a few thousand lines at most). For larger inputs swap in Myers,
 * but the current use case (editor preview against the saved revision) is
 * always small.
 */
export type LineDiffEntry =
  | { kind: "context"; text: string }
  | { kind: "removed"; text: string }
  | { kind: "added"; text: string };

export function lineDiff(before: string, after: string): LineDiffEntry[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;

  // Longest-common-subsequence table on lines.
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0),
  );
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const out: LineDiffEntry[] = [];
  let i = n;
  let j = m;
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
