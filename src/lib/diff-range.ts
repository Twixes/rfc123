export interface DiffRange {
  baseSha: string;
  compareSha: string;
}

/** GitHub uses `<sha>...<sha>` for compare URLs; we mirror that as `?diff=`.
 *  Accepts 7-40 char hex so short permalinks work too. */
export const DIFF_PARAM = "diff";

const DIFF_RANGE_RE = /^([0-9a-f]{7,40})\.\.\.([0-9a-f]{7,40})$/i;

export function parseDiffRange(raw: string | null): DiffRange | null {
  if (!raw) return null;
  const m = raw.match(DIFF_RANGE_RE);
  return m ? { baseSha: m[1], compareSha: m[2] } : null;
}

export function formatDiffRange(range: DiffRange): string {
  return `${range.baseSha}...${range.compareSha}`;
}
